import { describe, it, expect, beforeEach } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { evaluateExercise } from '../../src/features/classroom/exerciseEvaluator';
import {
  cleanNodesForStarterTopology,
  convertTopologyToExercise,
} from '../../src/features/classroom/topologyExerciseConverter';
import {
  parseExerciseJson,
  parseSubmissionJson,
  validateExercise,
  validateExerciseTarget,
  validateSubmission,
} from '../../src/features/classroom/exerciseParser';
import { buildPacketSubmission, edgesToLinks, evaluatePacket } from '../../src/features/classroom/submissionBuilder';
import { prepareStarterTopology } from '../../src/features/classroom/starterTopology';
import { csvCell } from '../../src/features/classroom/csv';
import { compactTopology, verifySubmission } from '../../src/features/classroom/verification';
import { useAppStore } from '../../src/store/useAppStore';
import { TOPOLOGY_TEMPLATES } from '../../src/data/topologyTemplates';
import type { DeviceData } from '../../src/types/network';
import type { Exercise, ExerciseTarget } from '../../src/features/classroom/types';

/** Regresi untuk perbaikan penilaian & impor pada audit Mode Kelas. */

const pc = (id: string, label: string, ip?: string, mask?: string, extra: Partial<DeviceData> = {}): DeviceData => ({
  id,
  label,
  type: 'pc',
  ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', macAddress: `00:50:79:00:00:${id.slice(-2).padStart(2, '0')}`, ...(ip ? { ipAddress: ip } : {}), ...(mask ? { subnetMask: mask } : {}) }],
  ...extra,
});

const sw = (id: string, label: string, vlan = 10): DeviceData => ({
  id,
  label,
  type: 'switch',
  ports: [
    { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:01:00:00:00:01', vlanId: vlan, portMode: 'access' },
    { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:01:00:00:00:02', vlanId: 20, portMode: 'access' },
  ],
});

const exercise = (targets: ExerciseTarget[], extra: Partial<Exercise> = {}): Exercise => ({
  id: 'ex-x',
  title: 'Soal X',
  instructions: 'x',
  difficulty: 'Dasar',
  targets,
  ...extra,
});

describe('Evaluator: kasus tepi yang sebelumnya salah menilai', () => {
  it('soal tanpa target = gagal (skor 0), bukan "passed" dengan feedback "Nilai 100"', async () => {
    const ev = await evaluateExercise(exercise([]), [], []);
    expect(ev.status).toBe('failed');
    expect(ev.score).toBe(0);
    expect(ev.feedback).not.toContain('Nilai 100');
    expect(ev.feedback).toContain('belum memiliki target');
  });

  it('target prefix dengan port ber-IP tetapi tanpa subnet mask TIDAK lolos', async () => {
    const t: ExerciseTarget = { id: 't', title: 'IP/24', type: 'device_config', deviceId: 'PC-1', address: '10.0.0.5', prefix: 24 };
    const noMask = await evaluateExercise(exercise([t]), [pc('pc-1', 'PC-1', '10.0.0.5')], []);
    expect(noMask.score).toBe(0);
    expect(noMask.checks[0].reason).toContain('Subnet mask belum dikonfigurasi');
    const ok = await evaluateExercise(exercise([t]), [pc('pc-1', 'PC-1', '10.0.0.5', '255.255.255.0')], []);
    expect(ok.score).toBe(100);
  });

  it('perangkat bertanda nodeKind "device" dikenali; anotasi (square/teks) tidak pernah dianggap perangkat', async () => {
    const t: ExerciseTarget = { id: 't', title: 'IP PC-1', type: 'device_config', deviceId: 'PC-1', address: '10.0.0.5' };
    const tagged = await evaluateExercise(exercise([t]), [pc('pc-1', 'PC-1', '10.0.0.5', '255.255.255.0', { nodeKind: 'device' })], []);
    expect(tagged.score).toBe(100);

    const annotationOnly: DeviceData = { id: 'sq-1', label: 'PC-1', type: 'pc', ports: [], nodeKind: 'square' };
    const decoy = await evaluateExercise(exercise([t]), [annotationOnly], []);
    expect(decoy.score).toBe(0);
    expect(decoy.checks[0].reason).toContain('tidak ditemukan');
  });

  it('siswa mengganti hostname: target tetap cocok lewat nama asli (originalLabel)', async () => {
    const t: ExerciseTarget = { id: 't', title: 'IP PC-1', type: 'device_config', deviceId: 'PC-1', address: '10.0.0.5', subnetMask: '255.255.255.0' };
    const renamed = pc('pc-1700', 'Lab-PC-Utama', '10.0.0.5', '255.255.255.0', { originalLabel: 'PC-1' });
    expect((await evaluateExercise(exercise([t]), [renamed], [])).score).toBe(100);
    // tanpa penanda nama asli (perangkat lama), perilaku semula tetap: tidak ditemukan
    const legacy = pc('pc-1700', 'Lab-PC-Utama', '10.0.0.5', '255.255.255.0');
    expect((await evaluateExercise(exercise([t]), [legacy], [])).score).toBe(0);
  });

  it('dua perangkat berlabel sama: utamakan yang memang berasal dari nama itu, bukan yang diganti namanya', async () => {
    const t: ExerciseTarget = { id: 't', title: 'IP PC-2', type: 'device_config', deviceId: 'PC-2', address: '10.0.0.2', subnetMask: '255.255.255.0' };
    const imposter = pc('pc-a', 'PC-2', '10.0.0.99', '255.255.255.0', { originalLabel: 'PC-1' }); // PC-1 yang diganti jadi PC-2
    const genuine = pc('pc-b', 'PC-2', '10.0.0.2', '255.255.255.0');
    expect((await evaluateExercise(exercise([t]), [imposter, genuine], [])).score).toBe(100);
    expect((await evaluateExercise(exercise([t]), [genuine, imposter], [])).score).toBe(100);
  });
});

describe('Topologi awal siswa tidak membocorkan "jawaban"', () => {
  const teacherNodes = [
    { id: 'sw1', data: sw('sw1', 'Switch-1', 10) },
    { id: 'pc1', data: pc('pc1', 'PC-1', '192.168.1.10', '255.255.255.0') },
  ] as unknown as Node<DeviceData>[];
  const vlanTargets: ExerciseTarget[] = [
    { id: 'v1', title: 'fa0/1 VLAN 10', type: 'vlan_config', deviceId: 'Switch-1', portId: 'fa0/1', vlanId: 10, mode: 'access' },
  ];

  it('tanpa pembersihan sadar-target, target VLAN langsung terpenuhi (skor 100) sebelum siswa bekerja — kondisi lama', async () => {
    const naive = cleanNodesForStarterTopology(teacherNodes);
    const ev = await evaluateExercise(exercise(vlanTargets), naive.map((n) => n.data), []);
    expect(ev.score).toBe(100);
  });

  it('pembersihan sadar-target mengembalikan port VLAN sasaran ke bawaan sehingga siswa harus mengerjakannya', async () => {
    const cleaned = cleanNodesForStarterTopology(teacherNodes, vlanTargets);
    const ports = cleaned[0].data.ports;
    expect(ports[0].vlanId).toBeUndefined();
    expect(ports[0].portMode).toBeUndefined();
    // port yang BUKAN sasaran target tetap utuh (bagian dari skenario guru)
    expect(ports[1].vlanId).toBe(20);
    // IP selalu dihapus
    expect(cleaned[1].data.ports[0].ipAddress).toBeUndefined();
    const ev = await evaluateExercise(exercise(vlanTargets), cleaned.map((n) => n.data), []);
    expect(ev.score).toBe(0);
  });

  it('prepareStarterTopology (HUD & modal) selalu membersihkan: jalur topologi guru maupun template', () => {
    const fromTopology = prepareStarterTopology(
      exercise(vlanTargets, { starterTopology: { nodes: teacherNodes, edges: [] } })
    );
    expect(fromTopology?.source.kind).toBe('topology');
    expect(fromTopology?.nodes[1].data.ports[0].ipAddress).toBeUndefined();
    expect(fromTopology?.nodes[0].data.ports[0].vlanId).toBeUndefined();

    const tpl = TOPOLOGY_TEMPLATES.find((t) => t.nodes.some((n) => n.data.ports.some((p) => p.ipAddress)));
    expect(tpl).toBeDefined();
    const fromTemplate = prepareStarterTopology(exercise([], { starterTemplateId: tpl!.id }));
    expect(fromTemplate?.source).toEqual({ kind: 'template', name: tpl!.name });
    expect(fromTemplate!.nodes.every((n) => n.data.ports.every((p) => p.ipAddress === undefined))).toBe(true);

    expect(prepareStarterTopology(exercise([]))).toBeNull();
    expect(prepareStarterTopology(exercise([], { starterTemplateId: 'tidak-ada' }))).toBeNull();
  });
});

describe('Converter topologi -> soal', () => {
  const node = (id: string, label: string, type: string, extra: Record<string, unknown> = {}) => ({
    id,
    data: { id, label, type, ports: [{ id: 'fa0', name: 'Fa0', ...(type === 'pc' ? { ipAddress: '10.0.0.1', subnetMask: '255.255.255.0' } : {}) }], ...extra },
  });

  it('anotasi square/teks tidak ikut dihitung sebagai perangkat atau dijadikan target', () => {
    const ex = convertTopologyToExercise({
      nodes: [
        node('pc1', 'PC-1', 'pc'),
        node('sq1', '', 'pc', { nodeKind: 'square', ports: [] }),
        node('tx1', '', 'pc', { nodeKind: 'text', ports: [] }),
      ],
      edges: [],
    });
    expect(ex.targets.some((t) => t.type === 'required_device_count')).toBe(false);
    expect(ex.targets.filter((t) => t.type === 'device_config')).toHaveLength(1);
    expect(ex.title).toContain('1 PC');
  });

  it('topologi tanpa perangkat (hanya anotasi) ditolak, bukan menghasilkan soal tanpa target', () => {
    expect(() =>
      convertTopologyToExercise({ nodes: [node('sq', '', 'pc', { nodeKind: 'square', ports: [] })], edges: [] })
    ).toThrow(/tidak memuat perangkat/);
    const parsed = parseExerciseJson(JSON.stringify({ nodes: [], edges: [] }));
    expect(parsed.success).toBe(false);
    expect(parsed.errors[0]).toContain('Gagal mengonversi');
  });

  it('id soal unik walau dikonversi dalam milidetik yang sama', () => {
    const topo = { nodes: [node('pc1', 'PC-1', 'pc')], edges: [] };
    const ids = new Set(Array.from({ length: 50 }, () => convertTopologyToExercise(topo).id));
    expect(ids.size).toBe(50);
  });
});

describe('Parser: validasi target & soal', () => {
  const dc = (over: Record<string, unknown>) => validateExerciseTarget({ type: 'device_config', deviceId: 'PC-1', address: '192.168.1.10', ...over }, 0);

  it('device_config: IP, subnet mask, gateway, dan prefix harus valid', () => {
    expect(dc({}).target).toBeDefined();
    expect(dc({ address: 'abc' }).error).toContain('IPv4 valid');
    expect(dc({ address: '999.1.1.1' }).error).toContain('IPv4 valid');
    expect(dc({ subnetMask: '255.0.255.0' }).error).toContain('subnet mask');
    expect(dc({ gateway: 'bukan-ip' }).error).toContain('gateway');
    expect(dc({ prefix: 33 }).error).toContain('prefix');
    expect(dc({ prefix: 24.5 }).error).toContain('prefix');
    const ok = dc({ subnetMask: '255.255.255.0', gateway: '192.168.1.1', prefix: 24 }).target as Extract<ExerciseTarget, { type: 'device_config' }>;
    expect(ok.gateway).toBe('192.168.1.1');
  });

  it('vlan_config & required_device_count: rentang dan bilangan bulat', () => {
    const vc = (vlanId: unknown) => validateExerciseTarget({ type: 'vlan_config', deviceId: 'SW', portId: 'fa0/1', vlanId }, 0);
    expect(vc(10).target).toBeDefined();
    expect(vc('20').target).toBeDefined();
    for (const bad of [0, 4095, -3, 1.5, '', null, undefined, 'abc']) expect(vc(bad).error).toContain('vlanId');
    const rc = (count: unknown) => validateExerciseTarget({ type: 'required_device_count', deviceType: 'pc', count }, 0);
    expect(rc(3).target).toBeDefined();
    for (const bad of [0, -1, 2.5, 9999, 'x']) expect(rc(bad).error).toContain('count');
  });

  it('starterTopology harus berbentuk { nodes[id], edges[] }', () => {
    const base = { title: 'S', instructions: 'i', targets: [{ type: 'link_exists', fromDeviceId: 'a', toDeviceId: 'b' }] };
    expect(validateExercise({ ...base, starterTopology: { nodes: [{ id: 'a' }], edges: [] } }).exercise).toBeDefined();
    expect(validateExercise({ ...base, starterTopology: { nodes: 'x', edges: [] } }).error).toContain('starterTopology');
    expect(validateExercise({ ...base, starterTopology: { nodes: [{}], edges: [] } }).error).toContain('starterTopology');
    expect(validateExercise({ ...base, starterTopology: { nodes: [], edges: 5 } }).error).toContain('starterTopology');
    expect(validateExercise(base).exercise?.starterTopology).toBeUndefined();
  });
});

describe('Berkas jawaban (.opsub): validasi', () => {
  const goodEval = { status: 'partial', score: 50, checks: [{ targetId: 't1', title: 'k', passed: true, reason: 'ok' }], feedback: 'bagus', evaluatedAt: '10.00' };
  const good = { participantId: 'stu-1', nickname: 'Ani', exerciseId: 'e1', score: 50, status: 'partial', evaluation: goodEval, submittedAt: 123 };

  it('menerima berkas valid dan menormalkan skor/status', () => {
    const r = parseSubmissionJson(JSON.stringify({ format: 'openpacket_submission', submission: { ...good, score: 9999, status: 'ngawur' } }));
    expect(r.success).toBe(true);
    expect(r.submission?.score).toBe(100);
    expect(r.submission?.status).toBe('passed');
    expect(r.submission?.evaluation.checks).toHaveLength(1);
  });

  it('menolak berkas tanpa evaluation / checks / nickname (penyebab layar guru kosong sebelumnya)', () => {
    const bad = (s: unknown) => parseSubmissionJson(JSON.stringify({ format: 'openpacket_submission', submission: s }));
    const noEval = bad({ participantId: 'x', nickname: 'Hantu', score: 100 });
    expect(noEval.success).toBe(false);
    expect(noEval.error).toContain('evaluasi');
    expect(bad({ ...good, evaluation: { ...goodEval, checks: 'bukan-array' } }).success).toBe(false);
    expect(bad({ ...good, evaluation: { ...goodEval, checks: [{ targetId: 1 }] } }).success).toBe(false);
    expect(bad({ ...good, nickname: '   ' }).success).toBe(false);
    expect(bad(null).success).toBe(false);
    expect(bad('teks').success).toBe(false);
  });

  it('nickname dibatasi 40 karakter dan evaluasi per soal yang rusak dibuang tanpa menggagalkan berkas', () => {
    const res = validateSubmission({ ...good, nickname: 'x'.repeat(200), evaluations: { a: goodEval, b: { checks: 'rusak' } }, exerciseScores: { a: 80, b: 'x' } });
    expect(res.submission?.nickname).toHaveLength(40);
    expect(Object.keys(res.submission?.evaluations ?? {})).toEqual(['a']);
    expect(res.submission?.exerciseScores).toEqual({ a: 80 });
  });

  it('mendukung objek submission mentah (tanpa pembungkus format)', () => {
    expect(parseSubmissionJson(JSON.stringify(good)).success).toBe(true);
    expect(parseSubmissionJson('{bukan json').success).toBe(false);
    expect(parseSubmissionJson(JSON.stringify({ hello: 'world' })).success).toBe(false);
  });
});

describe('CSV: sel aman', () => {
  it('menetralkan awalan rumus spreadsheet dan menggandakan kutip', () => {
    expect(csvCell('Budi')).toBe('"Budi"');
    expect(csvCell('=HYPERLINK("http://x","k")')).toBe('"\'=HYPERLINK(""http://x"",""k"")"');
    for (const ch of ['=', '+', '-', '@']) expect(csvCell(`${ch}1+1`)).toBe(`"'${ch}1+1"`);
    expect(csvCell('\t=1')).toBe('"\'\t=1"');
    expect(csvCell(42)).toBe('"42"');
    expect(csvCell('Ani "si juara"')).toBe('"Ani ""si juara"""');
  });
});

describe('Penilaian paket: konsisten dengan simulasi', () => {
  it('edgesToLinks menyertakan kind WiFi dan handle bawaan seperti hook simulasi', () => {
    const edges = [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'fa0', targetHandle: 'fa0/1' },
      { id: 'e2', source: 'c', target: 'd', type: 'wirelessLink' },
    ] as Edge[];
    expect(edgesToLinks(edges)).toEqual([
      { sourceNodeId: 'a', sourcePortId: 'fa0', targetNodeId: 'b', targetPortId: 'fa0/1', kind: 'ethernet' },
      { sourceNodeId: 'c', sourcePortId: 'fa0', targetNodeId: 'd', targetPortId: 'fa0', kind: 'wireless' },
    ]);
  });

  it('skor paket = rata-rata semua soal; rincian per soal ikut tersimpan', async () => {
    const nodes = [{ id: 'pc-1', type: 'deviceNode', position: { x: 0, y: 0 }, data: pc('pc-1', 'PC-1', '10.0.0.5', '255.255.255.0') }] as unknown as Node<DeviceData>[];
    const passEx = exercise([{ id: 't1', title: 'IP', type: 'device_config', deviceId: 'PC-1', address: '10.0.0.5' }], { id: 'ex-pass', title: 'Lulus' });
    const failEx = exercise([{ id: 't2', title: 'IP lain', type: 'device_config', deviceId: 'PC-1', address: '10.9.9.9' }], { id: 'ex-fail', title: 'Gagal' });

    const packet = await evaluatePacket([passEx, failEx], nodes, []);
    expect(packet.exerciseScores).toEqual({ 'ex-pass': 100, 'ex-fail': 0 });
    expect(packet.averageScore).toBe(50);
    expect(packet.status).toBe('partial');

    const sub = buildPacketSubmission({ id: 'stu-1', nickname: 'Ani', joinedAt: 1, status: 'in_progress' }, [passEx, failEx], 'ex-fail', packet);
    expect(sub.score).toBe(50);
    expect(sub.exerciseId).toBe('ex-fail');
    expect(sub.evaluation.score).toBe(0); // fokus pada soal yang sedang dipilih siswa
    expect(Object.keys(sub.evaluations ?? {})).toEqual(['ex-pass', 'ex-fail']);
  });
});

describe('Store: nama asli perangkat disimpan saat pertama kali diganti', () => {
  beforeEach(() => {
    useAppStore.setState({
      nodes: [{ id: 'pc-1', type: 'deviceNode', position: { x: 0, y: 0 }, data: pc('pc-1', 'PC-1') }] as never,
    });
  });

  it('GUI/CLI (updateDeviceConfig) menyimpan originalLabel sekali dan tidak menimpanya pada penggantian berikutnya', () => {
    const label = () => useAppStore.getState().nodes[0].data;
    useAppStore.getState().updateDeviceConfig('pc-1', { label: 'Host-A' });
    expect(label().originalLabel).toBe('PC-1');
    expect(label().label).toBe('Host-A');
    useAppStore.getState().updateDeviceConfig('pc-1', { label: 'Host-B' });
    expect(label().originalLabel).toBe('PC-1'); // tetap nama paling awal
    useAppStore.getState().updateDeviceConfig('pc-1', { defaultGateway: '10.0.0.1' });
    expect(label().originalLabel).toBe('PC-1');
  });

  it('memperbarui field lain atau label yang sama tidak membuat originalLabel', () => {
    useAppStore.getState().updateDeviceConfig('pc-1', { label: 'PC-1', defaultGateway: '10.0.0.1' });
    expect(useAppStore.getState().nodes[0].data.originalLabel).toBeUndefined();
  });
});

describe('Verifikasi ulang skor siswa dari snapshot topologi', () => {
  const linkEx = exercise([{ id: 't1', title: 'IP PC-1', type: 'device_config', deviceId: 'PC-1', address: '10.0.0.5', subnetMask: '255.255.255.0' }], { id: 'ex-v', title: 'Soal V' });
  const honestNodes = [{ id: 'pc-1', type: 'deviceNode', position: { x: 5, y: 9 }, selected: true, measured: { width: 1 }, data: pc('pc-1', 'PC-1', '10.0.0.5', '255.255.255.0') }] as unknown as Node<DeviceData>[];
  const sub = (score: number, extra: Record<string, unknown> = {}) => ({
    participantId: 'stu-1',
    nickname: 'Ani',
    exerciseId: 'ex-v',
    score,
    status: score === 100 ? 'passed' : ('partial' as const),
    evaluation: { status: 'passed' as const, score, checks: [], feedback: '', evaluatedAt: '' },
    submittedAt: 1234,
    ...extra,
  });

  it('compactTopology membuang posisi dan state UI, menyisakan id/tipe/data dan kabel', () => {
    const snap = compactTopology(honestNodes, [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'fa0', targetHandle: 'fa0/1', type: 'networkCable', animated: true, style: { stroke: 'red' } } as Edge]);
    expect(Object.keys(snap.nodes[0]).sort()).toEqual(['data', 'id', 'type']);
    expect(Object.keys(snap.edges[0]).sort()).toEqual(['id', 'source', 'sourceHandle', 'target', 'targetHandle', 'type']);
  });

  it('skor jujur = match; skor dimanipulasi = mismatch dengan nilai sebenarnya', async () => {
    const snap = compactTopology(honestNodes, []);
    const honest = await verifySubmission(sub(100) as never, snap, [linkEx]);
    expect(honest.status).toBe('match');
    expect(honest.verifiedScore).toBe(100);

    // topologi siswa sebenarnya salah IP, tetapi ia mengklaim 100
    const wrong = compactTopology([{ ...honestNodes[0], data: pc('pc-1', 'PC-1', '10.0.0.99', '255.255.255.0') }] as never, []);
    const forged = await verifySubmission(sub(100) as never, wrong, [linkEx]);
    expect(forged.status).toBe('mismatch');
    expect(forged.claimedScore).toBe(100);
    expect(forged.verifiedScore).toBe(0);
    expect(forged.submittedAt).toBe(1234);
  });

  it('paket multi-soal: dibandingkan dengan skor rata-rata; soal yang hilang = tidak dapat diverifikasi', async () => {
    const other = exercise([{ id: 't2', title: 'IP lain', type: 'device_config', deviceId: 'PC-1', address: '10.9.9.9' }], { id: 'ex-w', title: 'Soal W' });
    const snap = compactTopology(honestNodes, []);
    const multi = sub(50, { exerciseScores: { 'ex-v': 100, 'ex-w': 0 } });
    expect((await verifySubmission(multi as never, snap, [linkEx, other])).status).toBe('match');
    const missing = await verifySubmission(multi as never, snap, [linkEx]);
    expect(missing.status).toBe('unavailable');
    expect(missing.reason).toContain('Definisi soal');
  });

  it('tanpa snapshot atau penilaian gagal = tidak dapat diverifikasi (bukan dianggap cocok)', async () => {
    const none = await verifySubmission(sub(100) as never, null, [linkEx]);
    expect(none.status).toBe('unavailable');
    expect(none.reason).toContain('Snapshot');
    const broken = await verifySubmission(sub(100) as never, { nodes: [{ id: 'x' }], edges: [] } as never, [linkEx]);
    expect(broken.status).not.toBe('match');
  });
});

describe('Topologi awal: NAT & DHCP ikut dikosongkan', () => {
  it('menghapus dhcpPools, natTable, serta dhcpEnabled/natEnabled pada port', () => {
    const router = {
      id: 'r1',
      data: {
        id: 'r1', label: 'Router-1', type: 'router',
        dhcpPools: { 'fa0/0': { network: '192.168.1.0' } },
        natTable: [{ insideLocal: '10.0.0.2' }],
        ports: [
          { id: 'fa0/0', name: 'Fa0/0', status: 'up', macAddress: 'x', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', natEnabled: true, dhcpEnabled: true, ssid: 'JaringanLab' },
        ],
      },
    } as unknown as Node<DeviceData>;
    const [clean] = cleanNodesForStarterTopology([router]);
    expect(clean.data.dhcpPools).toBeUndefined();
    expect(clean.data.natTable).toBeUndefined();
    const port = clean.data.ports[0];
    expect(port.natEnabled).toBeUndefined();
    expect(port.dhcpEnabled).toBeUndefined();
    expect(port.ipAddress).toBeUndefined();
    expect(port.ssid).toBe('JaringanLab'); // SSID adalah perancah konektivitas WiFi, bukan jawaban
  });
});
