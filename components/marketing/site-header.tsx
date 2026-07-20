import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";

const navigation = [
  { href: "#weekly-view", label: "Product" },
  { href: "#connected-club", label: "How it works" },
  { href: "#for-clubs", label: "For clubs" },
] as const;

function SiteHeader() {
  return (
    <header className="relative z-20 border-b border-border bg-background">
      <div className="mx-auto flex min-h-18 w-full max-w-7xl flex-wrap items-center justify-between gap-x-5 px-4 py-2 sm:px-6 md:flex-nowrap md:py-0 lg:px-8">
        <a
          href="#top"
          className="group inline-flex min-h-11 items-center gap-2.5 rounded-lg pr-2 font-semibold tracking-[-0.02em] text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
          aria-label={`${brand.name} home`}
        >
          <span
            className="flex size-8 items-center justify-center rounded-[10px] bg-primary-strong text-sm font-bold text-primary-foreground transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-rotate-3"
            aria-hidden="true"
          >
            {brand.identity.mark}
          </span>
          <span>{brand.name}</span>
        </a>

        <nav
          aria-label="Primary navigation"
          className="order-3 flex w-full items-center justify-between border-t border-border md:order-none md:w-auto md:justify-start md:border-0"
        >
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-muted transition-colors duration-200 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35 sm:px-3"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <Button asChild size="small">
          <a href="#weekly-view">Explore GrassRoots</a>
        </Button>
      </div>
    </header>
  );
}

export { SiteHeader };
