# 月度规划只读 API

## 当前边界

`GET /api/planning/monthly` 提供博客首页现有备考时间轴的只读快照，供 `ScheduleWidget` 做“博客 → 客户端”的单向同步。接口不写入博客、Supabase 或客户端状态，也不公开暴露用户级 `planning_task_status`。

当前唯一周期是 `kaoyan-2027`，规划月份为 `2026-07` 至 `2026-12`，时区固定为 `Asia/Shanghai`。源数据仍是 [`components/home/studyTimelineData.ts`](../components/home/studyTimelineData.ts)。

## 认证与 CORS

服务端必须配置 `BLOG_PLANNING_READ_TOKEN`。请求使用：

```http
Authorization: Bearer <REDACTED>
```

未配置 token 时接口 fail closed 并返回 `503`；缺少或不匹配 token 返回 `401`。token 不放入 URL、客户端 bundle、日志或仓库。

浏览器/Tauri WebView 请求还需要把精确 Origin 放入 `BLOG_PLANNING_ALLOWED_ORIGINS`，多个值用逗号分隔。没有 `Origin` 的服务端请求不需要 CORS 白名单；未列出的 Origin 返回 `403`。

## 请求

```text
GET /api/planning/monthly?cycle=kaoyan-2027&month=2026-08
```

`cycle` 可以省略，默认 `kaoyan-2027`；`month` 必填且必须是 `YYYY-MM`。当前周期以备考周期建模，不把自然年份当成周期 ID。

## 成功响应

```json
{
  "success": true,
  "data": {
    "schemaVersion": 1,
    "cycle": {
      "id": "kaoyan-2027",
      "label": "2027 年考研备考周期",
      "targetExamYear": 2027,
      "planningMonths": ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]
    },
    "month": { "key": "2026-08", "label": "8月", "number": 8 },
    "timezone": "Asia/Shanghai",
    "source": { "kind": "study-timeline", "revision": "study-timeline-v1" },
    "updatedAt": null,
    "changeTracking": "etag",
    "capabilities": { "taskStatus": false, "exactDate": false },
    "items": [
      {
        "id": "kaoyan-2027:math-08-first-past-2014-2020",
        "externalKey": "math-08-first-past-2014-2020",
        "cycleId": "kaoyan-2027",
        "month": "2026-08",
        "subjectId": "math",
        "subjectLabel": "数学",
        "title": "2014-2020真题",
        "stage": "first",
        "stageLabel": "一刷",
        "order": 1
      }
    ]
  }
}
```

当前源数据只有月份、标题和刷题/看课阶段，没有精确日期、优先级、文章 URL、创建时间或更新时间；这些字段不会被伪造。`updatedAt` 保持 `null`，客户端使用响应 `ETag` 做变更检测。

`id` 是稳定客户端 ID：`<cycleId>:<现有 task.id>`。现有 `task.id` 同时作为 `externalKey`，标题变化不会导致客户端重复创建事项。

## 缓存与错误

成功响应带强 `ETag`、`Cache-Control: private, max-age=0, must-revalidate` 和 `X-Planning-Schema-Version`。发送匹配的 `If-None-Match` 时返回 `304`，不含 JSON body。

错误结构统一为：

```json
{
  "success": false,
  "error": {
    "code": "invalid_month",
    "message": "month 必须是 YYYY-MM 格式。",
    "details": { "month": "2026/08" }
  }
}
```

常见状态码：`400` 参数格式错误、`401` 凭据无效、`403` Origin 不允许、`404` 周期或月份不存在、`503` 服务端 token 未配置。

## 状态与后续扩展

博客的 `planning_task_status` 是登录用户级数据，当前只读 token 没有用户身份，因此首版不返回任务完成状态；`ScheduleWidget` 应保留自己的本地完成状态，不因同步快照而覆盖。将来若要同步状态，需先单独确定用户绑定与 RLS/服务端只读查询方案，再升级 schema 版本。
