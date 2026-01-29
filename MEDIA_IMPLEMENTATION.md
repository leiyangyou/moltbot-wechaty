# Wechaty Plugin Media Support Implementation

## Summary

基于 `out/clawdbot-feishu` 插件的最佳实践，重新实现了 Wechaty 插件的媒体文件收发功能。

## 主要改进

### 1. 核心架构对齐

**遵循 Feishu 插件的模式：**
- 使用 Clawdbot runtime 的 `core.channel.media.saveMediaBuffer()` 保存媒体
- 使用 `core.media.detectMime()` 检测 MIME 类型
- 构建标准的 MediaPayload (MediaPath, MediaUrl, MediaType, MediaPaths, MediaUrls, MediaTypes)
- 通过扩展运算符 `...mediaPayload` 将媒体信息添加到 context

### 2. 新增文件

**src/wechaty/media.ts**：
- `resolveWechatyMediaList()`: 下载并保存媒体文件
  - 从 Wechaty Message 获取 FileBox
  - 保存到临时目录
  - 读取 buffer
  - 使用 core.media.detectMime() 检测类型
  - 使用 core.channel.media.saveMediaBuffer() 保存到永久存储
  - 返回 WechatyMediaInfo[]

- `buildWechatyMediaPayload()`: 构建媒体 payload
  - 与 Feishu 的 buildFeishuMediaPayload() 相同的结构
  - 支持单个和多个媒体文件

- `prepareWechatyMedia()`: 准备发送媒体
  - 支持远程 URL（通过 fetch 下载）
  - 支持本地路径（支持 `~` 和 `file://`）
  - 支持 Buffer
  - 创建 FileBox 用于发送

### 3. 更新文件

**src/wechaty/monitor.ts**：
- 导入媒体处理函数
- 在 handleWechatyMessage() 中添加媒体处理：
  - 调用 resolveWechatyMediaList() 下载媒体
  - 调用 buildWechatyMediaPayload() 构建 payload
  - 在 finalizeInboundContext() 中通过 `...mediaPayload` 添加媒体信息
- 从配置读取 mediaMaxMb 设置

**src/wechaty/send.ts**：
- 更新 WechatySendOpts 类型添加 mediaBuffer 和 fileName
- 更新 sendMessageWechaty() 使用 prepareWechatyMedia()
- 添加错误处理和 fallback

**src/outbound.ts**：
- 改进 sendMedia 实现：
  - 先发送文本（如果有）
  - 再发送媒体
  - 失败时降级为 URL 链接

**src/config-schema.ts**：
- 添加 `mediaMaxMb` 配置项（默认 30MB）

### 4. 文档更新

**CLAUDE.md**：
- 更新 Message Flow 描述详细的媒体处理流程
- 更新 Key Files 说明媒体相关函数
- 更新 Implementation Details 详细说明媒体处理模式
- 更新 Common Pitfalls 添加媒体处理注意事项

**README.md**：
- 添加 Media Support 部分
- 说明支持的媒体类型
- 说明接收和发送的用法
- 添加配置示例

## 关键特性

### 接收媒体

1. **自动检测**：自动检测消息类型（3=image, 4=voice, 6=video, 15=file）
2. **下载保存**：使用 FileBox API 下载，保存到 Clawdbot 标准存储
3. **类型检测**：自动检测 MIME 类型
4. **Context 集成**：媒体路径和类型自动添加到消息 context
5. **Placeholder**：为不同类型生成占位符文本（`<media:image>`, `<media:audio>` 等）

### 发送媒体

1. **多源支持**：
   - 远程 URL
   - 本地文件路径（支持 `~` 扩展）
   - Buffer 数据

2. **自动降级**：发送失败时自动降级为文本 URL

3. **FileBox 集成**：使用 Wechaty 的 FileBox API 发送

## 实现对比

### 之前的设计（初版）
- 自定义媒体下载和存储逻辑
- 手动 MIME 类型映射
- 使用自定义的 uploadMediaToStorage() 占位符
- MediaUrl 直接设置为本地路径

### 当前实现（参考 Feishu）
- 使用 Clawdbot runtime 的标准 API
- 自动 MIME 检测
- 标准的 MediaPayload 结构
- 完整的 MediaPath/MediaUrl/MediaType/MediaPaths/MediaUrls/MediaTypes 支持
- 支持未来的多媒体文件场景

## 配置示例

```yaml
channels:
  wechaty:
    enabled: true
    puppet: "@juzi/wechaty-puppet-service"
    puppetOptions:
      token: "your_token"
    mediaMaxMb: 30  # 最大媒体文件大小（MB）
```

## 使用示例

### 接收媒体

媒体会自动下载并保存，context 中会包含：
```typescript
{
  MediaPath: "/path/to/saved/media.jpg",
  MediaUrl: "/path/to/saved/media.jpg",
  MediaType: "image/jpeg",
  MediaPaths: ["/path/to/saved/media.jpg"],
  MediaUrls: ["/path/to/saved/media.jpg"],
  MediaTypes: ["image/jpeg"]
}
```

### 发送媒体

```typescript
// 从 URL 发送
await sendMessageWechaty(target, "Here's an image", {
  mediaUrl: "https://example.com/image.jpg"
});

// 从本地路径发送
await sendMessageWechaty(target, "Local file", {
  mediaUrl: "~/Pictures/photo.png"
});

// 从 Buffer 发送
await sendMessageWechaty(target, "Generated image", {
  mediaBuffer: imageBuffer,
  fileName: "generated.png"
});
```

## 测试建议

1. 测试不同类型的媒体接收（图片、视频、音频、文件）
2. 测试不同来源的媒体发送（URL、本地路径、Buffer）
3. 测试媒体文件大小限制
4. 测试不同 puppet 的兼容性
5. 测试错误场景（网络失败、文件不存在等）

## 注意事项

1. **Runtime 依赖**：必须确保 wechatyRuntime 已初始化才能使用媒体功能
2. **Puppet 兼容性**：不同 puppet 对 FileBox 的支持可能不同
3. **临时文件**：下载的媒体会先保存到临时目录，然后复制到永久存储，临时文件会自动清理
4. **大小限制**：默认最大 30MB，可通过配置调整
5. **MIME 检测**：依赖 Clawdbot 的 core.media.detectMime()，确保支持常见格式
