import { brand } from "@/lib/brand";

function SiteFooter() {
  return (
    <footer id="for-clubs" className="bg-primary-strong text-primary-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-14 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
        <div>
          <p className="text-2xl font-semibold tracking-[-0.03em]">{brand.tagline}</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-primary-foreground/80">
            {brand.name} is being built as a shared operational home for junior football
            clubs. This public preview demonstrates the intended product experience.
          </p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          <a className="min-h-11 py-3 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-background/60" href="#top">
            Back to top
          </a>
          <a className="min-h-11 py-3 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-background/60" href="#weekly-view">
            Product
          </a>
          <a className="min-h-11 py-3 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-background/60" href="#connected-club">
            How it works
          </a>
        </nav>
      </div>
    </footer>
  );
}

export { SiteFooter };
