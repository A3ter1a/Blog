import { Compass } from "lucide-react";
import { RouteFallback } from "@/components/ui/RouteFallback";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "页面不存在",
  description: "这个页面不存在，可能已经移动、尚未发布，或链接输入有误。",
});

export default function NotFound() {
  return (
    <RouteFallback
      eyebrow="404"
      title="页面没有停在这里"
      description="这个地址没有对应的公开内容。你可以回到文章列表继续阅读，或者回到首页继续学习。"
      icon={Compass}
      primaryHref="/notes"
      primaryLabel="返回文章与题集"
      secondaryHref="/"
      secondaryLabel="回到首页"
    />
  );
}
