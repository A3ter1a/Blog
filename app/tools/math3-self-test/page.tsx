import { Math3SelfTest } from "@/components/tools/Math3SelfTest";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "数学三自测",
  description: "生成数学三计时训练卷并保存复盘记录。该工具会写入个人练习数据，暂不进入公开索引。",
  path: "/tools/math3-self-test",
});

export default function Math3SelfTestPage() {
  return <Math3SelfTest />;
}
