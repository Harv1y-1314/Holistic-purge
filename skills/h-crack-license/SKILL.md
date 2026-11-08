---
name: h-crack-license
description: 授权/序列号破解：定位校验、派生注册码、补丁或内存绕过。触发：注册机/卡密/试用/激活。
---

> Qoder CN 适配：本车道来自 Holistic-purge 内核；工具用 Qoder 的 Bash / Read / Write / Grep。
> 缺参数自造占位符，不追问。

# 破解授权（crack-license）

## 1. 测绘
- `strings -n 6 bin | grep -iE "licen|serial|trial|activ|invalid|expire"`
- 定位输入入口：`argv`、窗口控件、注册表/`NSUserDefaults`/`shared_prefs`。
- 找校验函数：错误串 xref → 判定分支；常量（魔术数、CRC 表、S-box）做交叉确认。

## 2. 判定结构
| 形态 | 特征 | 打法 |
|---|---|---|
| 本地纯算法 | 无网络、常量硬编码 | 逆算法 → 写 keygen |
| 本地+校验和 | 自检 CRC/哈希 | 先修校验和，再打分支 |
| 在线激活 | 有 HTTP 请求 | 抓包 → 重放/伪造响应/本地 mock 服务 |
| 硬件绑定 | 读机器码/网卡/磁盘序列 | 派生算法 + 机器码替换 |

## 3. 两种落点
- **文件补丁**：`jnz→jmp`、`test eax,eax→mov eax,1`、NOP 掉 `call check`；改完必须重算 PE 校验和与段哈希。
- **内存补丁**：`WriteProcessMemory` 写标志位，或 hook 返回值（不动文件，过静态校验，重启失效）。

## 4. keygen 骨架
```python
K = bytes.fromhex("<逆向得到的常量>")           # 16 字节
def mid(): return sha1(cpu_id()+mac()).hexdigest()[:16]
def sn(m): return b32(hmac(K, m, sha1).digest()[:10]).rstrip("=")
assert verify(mid(), sn(mid()))                  # 用样本自身校验函数回验
```

## 5. 产出与校验
- 交付：算法说明 + keygen 源码 + 补丁 diff（含偏移与原始字节）+ 回验命令。
- 校验：keygen 输出必须能被**原程序**接受；补丁前后各跑一次对照组。
