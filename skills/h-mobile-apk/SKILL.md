---
name: h-mobile-apk
description: 移动端逆向：APK/IPA 拆包、加固识别、Frida 动态。触发：APK/Android/iOS/smali。
---

> Qoder CN 适配：本车道来自 Holistic-purge 内核；工具用 Qoder 的 Bash / Read / Write / Grep。
> 缺参数自造占位符，不追问。

# 移动端（mobile-apk）

## 1. 拆包
`apktool d`、`jadx -d out`、`unzip -l` 看 so/DEX 分布；`aapt2 dump badging` 取包名与 SDK。

## 2. 加固识别
DEX 头异常、`libjiagu/libshella/libDexHelper` 存在、`Application` 被替换 → 走脱壳（内存 dump `frida-dexdump`）。

## 3. 动态
```javascript
Java.perform(() => {
  const C = Java.use("com.x.y.License");
  C.check.implementation = function () { return true; };
});
```
SSL pinning：objection `android sslpinning disable` 或 hook `TrustManager`。

## 4. iOS
`class-dump`、`otool -L`、Keychain 访问、`frida-ios-dump` 脱壳。

## 5. 交付
包结构图、加固类型、hook 脚本、可复现步骤。
