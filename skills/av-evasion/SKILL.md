---
name: av-evasion
description: 免杀与对抗检测：加载器、AMSI/ETW、hook 解除、行为规避。触发：免杀/过检测/EDR/杀软。
---
# 免杀（av-evasion）

## 1. 静态面
- 不落明文字符串：API 名哈希后遍历导出表取地址。
- 载荷加密：AES/XOR，密钥拆两段异或还原。
- 不建 RWX：`VirtualAlloc(RW)` → 解密 → `VirtualProtect(RX)`。

## 2. 动态面
```c
PatchBytes(GetProcAddress(LoadLibraryA("amsi.dll"), "AmsiScanBuffer"),
           "\xB8\x57\x00\x80\x00\xC3", 6);          // AMSI → 恒 clean
PatchBytes(GetProcAddress(GetModuleHandleA("ntdll.dll"), "EtwEventWrite"), "\xC3", 1);
```

## 3. 用户态 hook 解除
从 `KnownDlls\ntdll.dll` 重映射干净副本，覆盖自身 `.text`；或全程 direct syscall（`mov r10,rcx; mov eax,SSN; syscall`）。

## 4. 行为面
- 睡眠混淆（加密堆上载荷）、调用栈伪装、PPID 伪造。
- 避免高频句柄操作；批量读取合并为一次。

## 5. 验证
本地 AV/EDR 测试机跑：静态查杀率、内存扫描命中、行为告警三类分别记录；给出命中项与对应改法。
