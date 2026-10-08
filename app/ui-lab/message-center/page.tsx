"use client";

import Link from "next/link";

export default function MessageCenterLabPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-20 md:px-10">
      <div className="max-w-2xl">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Local interaction lab</span>
        <h1 className="mt-3 font-headline text-4xl font-bold text-on-surface md:text-5xl">消息中心状态实验台</h1>
        <p className="mt-5 text-base leading-8 text-on-surface-variant">
          这里使用隔离的本地任务样本检查消息中心的完整流程，不读取或写入 Supabase，也不会改变你的真实任务记录。
          右下角入口包含待处理、进行中、失败、待领取、已领取和已取消六类记录；待领取的 OCR 样本可以继续进入现有 /create 流程并插入正文。
          另外提供稳定的空态与加载态入口，便于复核首次打开和无记录时的反馈。
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary" href="/ui-lab/message-center">
            正常同步样本
          </Link>
          <Link className="rounded-xl border border-outline-variant/40 px-4 py-3 text-sm font-semibold text-on-surface" href="/ui-lab/message-center?state=sync-error">
            同步错误样本
          </Link>
          <Link className="rounded-xl border border-outline-variant/40 px-4 py-3 text-sm font-semibold text-on-surface" href="/ui-lab/message-center?state=loading">
            加载中样本
          </Link>
          <Link className="rounded-xl border border-outline-variant/40 px-4 py-3 text-sm font-semibold text-on-surface" href="/ui-lab/message-center?state=empty">
            空消息样本
          </Link>
          <Link className="rounded-xl border border-outline-variant/40 px-4 py-3 text-sm font-semibold text-on-surface" href="/tools">
            返回真实工具页
          </Link>
        </div>
        <dl className="mt-14 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5">
            <dt className="text-sm font-semibold text-on-surface">键盘路径</dt>
            <dd className="mt-2 text-sm leading-7 text-on-surface-variant">Tab 进入入口，打开后使用方向键切换分组，Escape 关闭抽屉或结果弹窗。</dd>
          </div>
          <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5">
            <dt className="text-sm font-semibold text-on-surface">验收重点</dt>
            <dd className="mt-2 text-sm leading-7 text-on-surface-variant">检查同步反馈、失败重试、结果领取、焦点回退和 2560×1440 / 390×844 的布局。</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
