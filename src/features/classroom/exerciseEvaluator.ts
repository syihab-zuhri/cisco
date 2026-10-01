import { HeadlessSimulationEngine } from '../../engine/simulationEngine';
import type { DeviceData, TopologyLink } from '../../types/network';
import { isSameSubnet, prefixLength } from '../../utils/ipUtils';
import type { Exercise, ExerciseCheck, ExerciseEvaluation, ExerciseTarget } from './types';

/**
 * Cari perangkat menurut id atau label. Bila siswa mengganti hostname, label lama
 * (`originalLabel`) tetap dikenali. Jika beberapa perangkat berlabel sama, utamakan yang
 * memang berasal dari nama itu (bukan perangkat lain yang diganti namanya menjadi itu).
 */
function matchDevice(devices: DeviceData[], identifier: string): DeviceData | undefined {
  const lower = identifier.trim().toLowerCase();
  const exact = devices.filter(
    (d) => d.id.toLowerCase() === lower || d.label.toLowerCase() === lower
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    return (
      exact.find(
        (d) => d.id.toLowerCase() === lower || (d.originalLabel ?? d.label).toLowerCase() === lower
      ) ?? exact[0]
    );
  }
  return devices.find((d) => d.originalLabel?.toLowerCase() === lower);
}

export async function evaluateExercise(
  exercise: Exercise,
  devices: DeviceData[],
  links: TopologyLink[]
): Promise<ExerciseEvaluation> {
  const engine = new HeadlessSimulationEngine();
  // Filter out annotations before passing to simulation engine
  // Anotasi kanvas (square/teks) bukan perangkat; nodeKind 'device' / kosong = perangkat.
  const networkDevices = devices.filter((d) => (d.nodeKind ?? 'device') === 'device');
  engine.setTopology(networkDevices, links);

  const checks: ExerciseCheck[] = [];

  if (exercise.targets.length === 0) {
    return {
      status: 'failed',
      score: 0,
      checks,
      feedback: 'Soal ini belum memiliki target penilaian sehingga tidak dapat dinilai. Hubungi guru.',
      evaluatedAt: new Date().toLocaleTimeString(),
    };
  }

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
          p.subInterfaces
            ? p.subInterfaces.map((s) => ({
                ...s,
                parentPort: p.name,
                parentPortId: p.id,
                parentStatus: p.status,
              }))
            : []
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

      // Edge case: Sub-interface jika port induknya DOWN
      if (matchedSubIf && matchedSubIf.parentStatus === 'down') {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `IP ${target.address} terkonfigurasi pada sub-interface ${matchedSubIf.parentPort}.${matchedSubIf.vlanId}, tetapi interface fisik induk (${matchedSubIf.parentPort}) masih berstatus DOWN (jalankan 'no shutdown').`,
        };
      }

      // Edge case: Port fisik router ber-IP jika port masih DOWN (administratively down)
      if (matchedPort && dev.type === 'router' && matchedPort.status === 'down') {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `IP ${target.address} terkonfigurasi pada port ${matchedPort.name} (${dev.label}), namun interface masih DOWN (jalankan 'no shutdown' di CLI).`,
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

      if (target.prefix !== undefined && !activeMask) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Subnet mask belum dikonfigurasi (diharapkan prefix /${target.prefix}).`,
        };
      }

      if (target.prefix !== undefined && activeMask) {
        const activePrefix = prefixLength(activeMask);
        if (activePrefix !== target.prefix) {
          return {
            targetId: target.id,
            title: target.title,
            passed: false,
            reason: `Prefix length tidak cocok (diharapkan: /${target.prefix}, saat ini: /${activePrefix}).`,
          };
        }
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
      const matchingLinks = links.filter(
        (l) =>
          (l.sourceNodeId === fromDev.id && l.targetNodeId === toDev.id) ||
          (l.sourceNodeId === toDev.id && l.targetNodeId === fromDev.id)
      );
      const hasLink = matchingLinks.some((l) => {
        const fromPortId = l.sourceNodeId === fromDev.id ? l.sourcePortId : l.targetPortId;
        const toPortId = l.sourceNodeId === toDev.id ? l.sourcePortId : l.targetPortId;
        const p1 = fromDev.ports.find((p) => p.id === fromPortId);
        const p2 = toDev.ports.find((p) => p.id === toPortId);
        return Boolean(p1 && p2);
      });
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

      // Validasi perangkat sumber memiliki konfigurasi IP
      const srcHasIp = srcDev.ports.some(
        (p) => Boolean(p.ipAddress) || p.subInterfaces?.some((s) => Boolean(s.ipAddress))
      );
      if (!srcHasIp) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Perangkat sumber ${srcDev.label} belum memiliki konfigurasi IP address.`,
        };
      }

      const srcDownPort = srcDev.ports.find((p) => p.ipAddress && p.status === 'down');
      const hasUpIp = srcDev.ports.some(
        (p) =>
          (p.ipAddress && p.status === 'up') ||
          (p.status === 'up' && p.subInterfaces?.some((s) => Boolean(s.ipAddress)))
      );
      if (srcDownPort && !hasUpIp) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Ping gagal dari ${srcDev.label} ke ${dstDev.label}: Interface ${srcDownPort.name} pada ${srcDev.label} masih DOWN (belum diaktifkan).`,
        };
      }

      // Kumpulkan seluruh kandidat IP tujuan yang aktif
      const candidateDstIps: string[] = [];
      for (const p of dstDev.ports) {
        if (p.status === 'up' && p.ipAddress) {
          candidateDstIps.push(p.ipAddress);
        }
        if (p.status !== 'down' && p.subInterfaces) {
          for (const s of p.subInterfaces) {
            if (s.ipAddress) {
              candidateDstIps.push(s.ipAddress);
            }
          }
        }
      }

      if (candidateDstIps.length === 0) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Perangkat tujuan ${dstDev.label} belum memiliki IP aktif untuk diping atau interface masih DOWN.`,
        };
      }

      // Prioritaskan kandidat IP tujuan yang satu segmen / subnet dengan interface sumber
      const srcSubnetPairs: Array<{ ip: string; mask: string }> = [];
      for (const p of srcDev.ports) {
        if (p.ipAddress && p.subnetMask) {
          srcSubnetPairs.push({ ip: p.ipAddress, mask: p.subnetMask });
        }
        if (p.subInterfaces) {
          for (const s of p.subInterfaces) {
            if (s.ipAddress && s.subnetMask) {
              srcSubnetPairs.push({ ip: s.ipAddress, mask: s.subnetMask });
            }
          }
        }
      }

      candidateDstIps.sort((a, b) => {
        const aSame = srcSubnetPairs.some((sp) => isSameSubnet(sp.ip, a, sp.mask)) ? 1 : 0;
        const bSame = srcSubnetPairs.some((sp) => isSameSubnet(sp.ip, b, sp.mask)) ? 1 : 0;
        return bSame - aSame;
      });

      let lastReason = '';
      for (const dstIp of candidateDstIps) {
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
          let diagnosticHint =
            (pingRes.outputLines && pingRes.outputLines[pingRes.outputLines.length - 1]) ||
            'Destination Host Unreachable';

          const srcPort = srcDev.ports.find((p) => p.ipAddress);
          if (srcPort && srcPort.status === 'down') {
            diagnosticHint = `Interface ${srcPort.name} pada ${srcDev.label} masih DOWN (belum diaktifkan).`;
          } else if (
            srcPort &&
            srcPort.subnetMask &&
            !isSameSubnet(srcPort.ipAddress!, dstIp, srcPort.subnetMask)
          ) {
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

          lastReason = `Ping gagal dari ${srcDev.label} ke ${dstDev.label} (${dstIp}): ${diagnosticHint}`;
        } catch (err) {
          lastReason = `Simulasi ping gagal dieksekusi: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      return {
        targetId: target.id,
        title: target.title,
        passed: false,
        reason: lastReason || `Ping gagal dari ${srcDev.label} ke ${dstDev.label}.`,
      };
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
      const cleanPortId = target.portId.toLowerCase().replace(/\s+/g, '');
      const port = dev.ports.find(
        (p) =>
          p.id.toLowerCase().replace(/\s+/g, '') === cleanPortId ||
          p.name.toLowerCase().replace(/\s+/g, '') === cleanPortId
      );
      if (!port) {
        return {
          targetId: target.id,
          title: target.title,
          passed: false,
          reason: `Port ${target.portId} tidak ditemukan pada ${dev.label}.`,
        };
      }
      const modeMatches = (port.portMode ?? 'access') === target.mode;
      const vlanMatches =
        target.mode === 'trunk' ? modeMatches : (port.vlanId ?? 1) === target.vlanId;
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
