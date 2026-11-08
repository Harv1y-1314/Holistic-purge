---
name: reverse-native
description: Native 逆向与脱壳：静态定位、动态 hook、反调试绕过。触发：逆向/脱壳/IDA/Frida/PE/ELF。
---
# Native 逆向（reverse-native）

## 1. 静态
- 格式确认：`file`、`otool -l`/`readelf -S`、节表与入口。
- 符号与字符串：`nm -D`、`strings`、导入表（IAT/PLT/GOT）。
- 关键路径：从错误串/常量 xref 反推到判定点。

## 2. 动态
```javascript
// frida：定位 → 观测 → 改返回值
const base = Module.findBaseAddress("libtarget.so");
const fn = base.add(0x1A4C0);                  // 偏移来自 IDA xref
Interceptor.attach(fn, { onLeave(r) { r.replace(ptr(1)); } });
```

## 3. 脱壳
| 壳 | 手法 |
|---|---|
| UPX | `upx -d`；手脱：单步到 `popad` 后 jmp，dump + IAT 修复 |
| Themida/VMProtect | 过反调试 → 断 `VirtualProtect(RWX)` → OEP dump → 重建 IAT；VM 段用 handler 语义表还原 |
| 自定义壳 | 找解密循环（写回自身 `.text` 的 memcpy/xor 循环），下内存写断点 |

## 4. 反调试
```bash
LD_PRELOAD=./nopt.so ./target        # ptrace 空实现
# PEB.BeingDebugged → hook IsDebuggerPresent 返回 0
# 时间差检测 → hook clock_gettime/QueryPerformanceCounter 返回固定步长
```

## 5. 产出
偏移表（模块+偏移+含义）、hook 脚本、脱壳前后 OEP 与 IAT 差异、可复现步骤。
