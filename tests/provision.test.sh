#!/bin/bash
# 全套装落盘层：模式（light 待命 / full 在线）、幂等、改动保护、暂停恢复
set -uo pipefail
SELF="$(cd "$(dirname "$0")/.." && pwd)"
TMP=$(mktemp -d)
DSH_HOME="$TMP" node --input-type=module -e "
import { provision, suspend, resume, status } from 'file://$SELF/lib/provision.mjs';
import { readMode, writeMode } from 'file://$SELF/lib/mode.mjs';
import fs from 'node:fs';
const root = '$SELF';
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fail = 1; };

// 安装默认：没有 mode 文件 → light；全量资产仍全部落盘待命
ok(readMode() === 'light', '安装默认 mode=light');
provision(root);
let st = status(root);
ok(st.lanes.live === 10, '车道在线 10（' + st.lanes.live + '）');
ok(st.pack.live === 0 && st.pack.off === st.pack.package && st.pack.package > 300,
   'light：领域技能 0 在线 / ' + st.pack.off + ' 待命 / 共 ' + st.pack.package);
ok(fs.existsSync(process.env.DSH_HOME + '/.holistic/skills-off/' + fs.readdirSync(root + '/skills-pack')[0]),
   '待命区确实有实体文件');

const again = provision(root);
ok(again.lanes.provisioned.length === 0 && again.pack.provisioned.length === 0, 'light 幂等：第二次 0 变更');

// 切 full：待命区整体搬回在线区
writeMode('full');
provision(root);
st = status(root);
ok(st.mode === 'full' && st.pack.live === st.pack.package && st.pack.off === 0,
   'full：领域技能 ' + st.pack.live + ' 在线 / 0 待命');
const f = process.env.DSH_HOME + '/skills/h-crack-license/SKILL.md';
fs.appendFileSync(f, '\n<!-- tweak -->\n');
const third = provision(root);
ok(third.lanes.kept.includes('crack-license'), '用户改动被保留（kept）');

// 切回 light：未改动的收走，被改动的留在在线区
writeMode('light');
provision(root);
st = status(root);
ok(st.pack.live === 0 && st.pack.off === st.pack.package, '切回 light：全部收进待命区（' + st.pack.off + '）');
ok(st.lanes.live === 10, '车道不被模式切换影响（' + st.lanes.live + '）');

// 暂停 / 恢复（插件停用路径）
const s = suspend();
ok(s.moved.length > 0, '暂停移走 ' + s.moved.length + ' 份');
resume();
const r = status(root);
ok(r.lanes.live === 10 && r.pack.live === r.pack.package, '恢复后回到全量在线（' + r.pack.live + '）');
process.exit(fail);
"
rc=$?
rm -rf "$TMP"
[ "$rc" = 0 ] && echo "provision: PASS" || echo "provision: FAIL"
exit $rc
