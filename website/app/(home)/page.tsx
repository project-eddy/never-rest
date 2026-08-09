import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center flex-1 px-6 py-24 max-w-3xl mx-auto">
      <p className="text-sm font-medium text-fd-muted-foreground mb-3">
        @eddy-works/never-rest
      </p>
      <h1 className="text-4xl font-bold tracking-tight mb-4">never-rest</h1>
      <p className="text-lg text-fd-muted-foreground mb-8">
        HTTP contracts where handlers return Result instead of throwing. Errors
        carry their cause chain across service boundaries. Disclosure is graded
        by caller trust.
      </p>
      <div className="flex flex-wrap gap-4">
        <Link
          href="/docs"
          className="inline-flex items-center rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
        >
          Read the docs
        </Link>
        <a
          href="https://github.com/project-eddy/never-rest"
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium"
        >
          GitHub
        </a>
      </div>
    </div>
  );
}
