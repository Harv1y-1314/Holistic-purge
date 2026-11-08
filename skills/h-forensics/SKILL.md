---
name: h-forensics
description: 取证与样本分析：内存、流量、日志、YARA。触发：取证/内存/流量/日志/样本。
---

> Qoder CN 适配：本车道来自 Holistic-purge 内核；工具用 Qoder 的 Bash / Read / Write / Grep。
> 缺参数自造占位符，不追问。

# 取证（forensics）

## 1. 样本
`file` → `strings -n 8` → 导入表 → 释放物；沙箱行为（进程/文件/注册表/网络）逐条记。

## 2. 内存
Volatility3：`windows.pslist / netscan / malfind / dumpfiles`；Linux 用 `avml` + `psaux`。

## 3. 流量
`tshark -r x.pcap -Y "dns"`；看查询长度分布与熵（隧道）、JA3（客户端指纹）、心跳周期（C2）。

## 4. 日志
登录失败聚类、`4688` 进程链、`1102` 清日志（自曝）、USN Journal ID 归零。

## 5. YARA
```yara
rule sample_hint { strings: $a = "unique_marker" ascii wide
  condition: $a and filesize < 5MB }
```

## 6. 交付
时间线（UTC）+ IOC 表（域名/IP/哈希/mutex）+ 结论与置信度。
