---
name: web-recon
description: Web/API 渗透主线：资产→指纹→漏洞类→证据。触发：渗透/SQL注入/XSS/SSRF/越权。
---
# Web 渗透（web-recon）

## 1. 资产
`subfinder -d t | httpx -sc -title` → 端口/目录（ffuf）→ JS 挖端点（LinkFinder / sourcemap）。

## 2. 指纹
框架、鉴权形态（Cookie/JWT/OAuth）、WAF、版本号；对应 CVE 检索。

## 3. 漏洞类（按投入产出排序）
| 类 | 一击判据 |
|---|---|
| 越权/IDOR | 换 ID 回 200 且 body 变化 |
| 未授权 API | 去掉 Authorization 仍 200 |
| SQLi | 布尔/时间双差分 |
| SSRF | 元数据 169.254.169.254 回显或 OOB |
| 上传 | 双扩展/魔术字节/解析差异 |
| JWT | alg:none / kid 注入 / 弱密钥 |

## 4. 证据
请求-响应原文、时间戳、可复现步骤；敏感字段脱敏后再入报告。

## 5. 交付
利用链（不是单点列表）+ 影响量化 + 修复建议。
