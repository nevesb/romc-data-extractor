import Image from "next/image";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/items", label: "Items" },
  { href: "/monsters", label: "Monsters" },
  { href: "/skills", label: "Skills" },
  { href: "/formulas", label: "Formulas" },
  { href: "/buffs", label: "Buffs" },
];

export function SiteHeader() {
  return (
    <header className="romc-header">
      <div className="romc-header__inner">
        <Link href="/" className="romc-logo">
          <Image src="/icon.png" alt="ROMClassic Wiki" width={28} height={28} className="h-7 w-7 rounded-lg" priority />
          <span>ROMClassic Wiki</span>
        </Link>
        <nav className="romc-nav">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="romc-nav-link">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
