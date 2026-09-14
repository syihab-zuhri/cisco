import { HeadlessSimulationEngine } from '../../engine/simulationEngine';
import type { DeviceData, TopologyLink } from '../../types/network';
import { isSameSubnet } from '../../utils/ipUtils';
import type { Exercise, ExerciseCheck, ExerciseEvaluation, ExerciseTarget } from './types';

function matchDevice(devices: DeviceData[], identifier: string): DeviceData | undefined {
  const lower = identifier.toLowerCase();
  return devices.find(
    (d) => d.id.toLowerCase() === lower || d.label.toLowerCase() === lower
  );
}

export async function evaluateExercise(
  exercise: Exercise,
  devices: DeviceData[],
  links: TopologyLink[]
): Promise<ExerciseEvaluation> {
  const engine = new HeadlessSimulationEngine();
  // Filter out annotations before passing to simulation engine
  const networkDevices = devices.filter((d) => !('nodeKind' in d));
  engine.setTopology(networkDevices, links);

  const checks: ExerciseCheck[] = [];

  for (const target of exercise.targets) {
    const check = await evaluateTarget(target, networkDevices, links, engine);
    checks.push(check);
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const score = total > 0 ? Math.round((passedCount / total) * 100) : 0;
  const status: 'passed' | 'partial' | 'failed' =
    passedCount === total ? 'passed' : passedCount === 0 ? 'failed' : 'partial';

  const feedback =
    passedCount === total
      ? `Luar biasa! Seluruh ${total} target berhasil dicapai dengan sempurna (Nilai 100).`
      : `${passedCount} dari ${total} target tercapai (${score}%). Periksa target yang belum lolos dan coba lagi.`;

  return {
    status,
    score,
    checks,
    feedback,
    evaluatedAt: new Date().toLocaleTimeString(),
  };
}

async function evaluateTarget(
  target: ExerciseTarget,
  devices: DeviceData[],
  links: TopologyLink[],
  engine: HeadlessSimulationEngine
): Promise<ExerciseCheck> {
  switch (target.type) {
    case 'device_config': {
      const dev = matchDevice(devices, target.deviceId);
      if (!dev) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Perangkat ${target.deviceId} tidak ditemukan di kanvas.`,
        };
      }

      // Cari IP pada port fisik atau sub-interface (Router-on-a-Stick)
      const matchedPort = dev.ports.find((p) => p.ipAddress === target.address);
      const matchedSubIf = dev.ports
        .flatMap((p) =>
          p.subInterfaces ? p.subInterfaces.map((s) => ({ ...s, parentPort: p.name })) : []
        )
        .find((s) => s.ipAddress === target.address);

      if (!matchedPort && !matchedSubIf) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `IP ${target.address} belum dikonfigurasi pada port/sub-interface ${dev.label}.`,
        };
      }

      const activeMask = matchedPort?.subnetMask || matchedSubIf?.subnetMask;
      if (target.subnetMask && activeMask !== target.subnetMask) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Subnet mask tidak cocok (diharapkan: ${target.subnetMask}, saat ini: ${activeMask || '-'}).`,
        };
      }

      // Validasi Default Gateway bila disyaratkan dalam target
      if (target.gateway) {
        if (!dev.defaultGateway) {
          return {
            targetId: target.id,
            title: target.title,
            passed: false,
            reason: `Default Gateway pada ${dev.label} belum diisi (diharapkan: ${target.gateway}).`,
          };
        }
        if (dev.defaultGateway !== target.gateway) {
          return {
            targetId: target.id,
            title: target.title,
            passed: false,
            reason: `Default Gateway tidak sesuai pada ${dev.label} (diharapkan: ${target.gateway}, saat ini: ${dev.defaultGateway}).`,
          };
        }
      }

      const locationDesc = matchedSubIf
        ? `sub-interface VLAN ${matchedSubIf.vlanId} (${matchedSubIf.parentPort})`
        : `port ${dev.label}`;

      return {
        targetId: target.id,
        title: target.title,
        passed: true,
        reason: `Konfigurasi IP ${target.address}${target.gateway ? ` & Gateway ${target.gateway}` : ''} pada ${locationDesc} sesuai.`,
      };
    }

    case 'link_exists': {
      const fromDev = matchDevice(devices, target.fromDeviceId);
      const toDev = matchDevice(devices, target.toDeviceId);
      if (!fromDev || !toDev) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Perangkat ${target.fromDeviceId} atau ${target.toDeviceId} belum ada di kanvas.`,
        };
      }
      const hasLink = links.some(
        (l) =>
          (l.sourceNodeId === fromDev.id && l.targetNodeId === toDev.id) ||
          (l.sourceNodeId === toDev.id && l.targetNodeId === fromDev.id)
      );
      return {
        targetId: target.id,
        title: target.title,
        passed: hasLink,
        reason: hasLink
          ? `Kabel antara ${fromDev.label} dan ${toDev.label} terhubung.`
          : `Hubungkan kabel antara ${fromDev.label} dan ${toDev.label}.`,
      };
    }

    case 'reachability': {
      const srcDev = matchDevice(devices, target.sourceDeviceId);
      const dstDev = matchDevice(devices, target.destinationDeviceId);
      if (!srcDev || !dstDev) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Perangkat sumber (${target.sourceDeviceId}) atau tujuan (${target.destinationDeviceId}) tidak ditemukan di kanvas.`,
        };
      }

      // Cari IP aktif tujuan pada port fisik atau sub-interface
      let dstIp = dstDev.ports.find((p) => p.ipAddress && p.status === 'up')?.ipAddress;
      if (!dstIp) {
        for (const p of dstDev.ports) {
          if (p.status !== 'down' && p.subInterfaces && p.subInterfaces.length > 0) {
            const sub = p.subInterfaces.find((s) => Boolean(s.ipAddress));
            if (sub) {
              dstIp = sub.ipAddress;
              break;
            }
          }
        }
      }

      if (!dstIp) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Perangkat tujuan ${dstDev.label} belum memiliki IP aktif untuk diping.`,
        };
      }

      try {
        const pingRes = await engine.executePing(srcDev.id, dstIp);
        const passed = Boolean(pingRes.success && pingRes.received > 0);

        if (passed) {
          return {
            targetId: target.id,
            title: target.title,
            passed: true,
            reason: `Ping sukses dari ${srcDev.label} ke ${dstDev.label} (${pingRes.received}/${pingRes.sent} paket diterima).`,
          };
        }

        // Analisa diagnostik edukatif untuk mempermudah siswa
        let diagnosticHint = (pingRes.outputLines && pingRes.outputLines[pingRes.outputLines.length - 1]) || 'Destination Host Unreachable';

        const srcPort = srcDev.ports.find((p) => p.ipAddress);
        if (srcPort && srcPort.status === 'down') {
          diagnosticHint = `Interface ${srcPort.name} pada ${srcDev.label} masih DOWN (belum diaktifkan).`;
        } else if (srcPort && srcPort.subnetMask && !isSameSubnet(srcPort.ipAddress!, dstIp, srcPort.subnetMask)) {
          if (!srcDev.defaultGateway) {
            diagnosticHint = `${srcDev.label} dan ${dstDev.label} berada pada subnet berbeda, namun Default Gateway ${srcDev.label} belum diisi.`;
          } else {
            const gwExists = devices.some((d) =>
              d.ports.some(
                (p) =>
                  p.ipAddress === srcDev.defaultGateway ||
                  p.subInterfaces?.some((s) => s.ipAddress === srcDev.defaultGateway)
              )
            );
            if (!gwExists) {
              diagnosticHint = `Default Gateway ${srcDev.defaultGateway} pada ${srcDev.label} tidak ditemukan pada router mana pun di topologi.`;
            }
          }
        }

        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Ping gagal dari ${srcDev.label} ke ${dstDev.label} (${dstIp}): ${diagnosticHint}`,
        };
      } catch (err) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Simulasi ping gagal dieksekusi: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'required_device_count': {
      const actualCount = devices.filter((d) => d.type === target.deviceType).length;
      const passed = actualCount >= target.count;
      return {
        targetId: target.id,
        title: target.title,
        passed,
        reason: passed
          ? `Jumlah perangkat tipe ${target.deviceType} mencukupi (${actualCount}/${target.count}).`
          : `Dibutuhkan minimal ${target.count} perangkat ${target.deviceType} (saat ini: ${actualCount}).`,
      };
    }

    case 'vlan_config': {
      const dev = matchDevice(devices, target.deviceId);
      if (!dev) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Switch ${target.deviceId} tidak ditemukan di kanvas.`,
        };
      }
      const port = dev.ports.find((p) => p.id === target.portId || p.name === target.portId);
      if (!port) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Port ${target.portId} tidak ditemukan pada ${dev.label}.`,
        };
      }
      const vlanMatches = port.vlanId === target.vlanId;
      const modeMatches = (port.portMode ?? 'access') === target.mode;
      const passed = vlanMatches && modeMatches;
      return {
        targetId: target.id,
        title: target.title,
        passed,
        reason: passed
          ? `Port ${port.name} terkonfigurasi ${target.mode} VLAN ${target.vlanId}.`
          : `Konfigurasi VLAN tidak sesuai pada port ${port.name} (diharapkan: VLAN ${target.vlanId} ${target.mode}, saat ini: VLAN ${port.vlanId ?? 1} ${port.portMode ?? 'access'}).`,
      };
    }
  }
}
