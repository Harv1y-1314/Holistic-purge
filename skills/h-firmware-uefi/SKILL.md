---
name: h-firmware-uefi
description: 固件与 UEFI：提取、解包、模块遍历、SMI 分析。触发：固件/UEFI/binwalk/squashfs/SPI。
---

> Qoder CN 适配：本车道来自 Holistic-purge 内核；工具用 Qoder 的 Bash / Read / Write / Grep。
> 缺参数自造占位符，不追问。

# 固件 / UEFI（firmware-uefi）

## 1. 提取
`binwalk -eM fw.bin`；`unsquashfs`/`ubireader`/`jefferson`；SPI dump 用 `flashrom -p ch341a_spi -r dump.bin`。

## 2. UEFI 卷
`uefi-firmware-parser -b fw.bin` 或 `UEFITool` 找 FV → 模块；`EFI_GUID` 对照已知表定位 DXE/SMM。

## 3. 分析
- 硬编码凭据、默认口令、私钥（`grep -a "BEGIN RSA"`）。
- SMM 模块：SMI handler 的 `SwSmiInputValue` 与缓冲区校验缺失。
- 安全启动链：PK/KEK/db 变量、`SetupMode`。

## 4. 交付
卷/模块清单、可疑模块与理由、可利用点（含地址与调用条件）、修复建议（签名/校验）。
