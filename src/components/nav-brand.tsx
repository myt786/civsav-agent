import Link from "next/link";
import Image from "next/image";

export function NavBrand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <Image src="/civsav-icon.png" alt="" width={24} height={24} className="rounded-md" priority />
      <span className="text-sm font-medium text-foreground">civsav</span>
    </Link>
  );
}
