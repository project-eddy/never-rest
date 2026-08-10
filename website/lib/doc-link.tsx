import type { ComponentProps, FC } from 'react';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { LoaderConfig, LoaderOutput, Page } from 'fumadocs-core/source';
import { source } from '@/lib/source';

/**
 * Fumadocs resolveHref only rewrites hrefs that start with `./` or `../`.
 * Bare sibling links like `concepts.md` work on GitHub but 404 on the site —
 * normalize them to `./concepts.md` before resolving.
 */
function normalizeBareMarkdownHref(href: string): string {
  if (
    href.startsWith('./') ||
    href.startsWith('../') ||
    href.startsWith('/') ||
    href.startsWith('#') ||
    href.includes('://')
  ) {
    return href;
  }

  if (/\.md(?:#|$)/.test(href)) {
    return `./${href}`;
  }

  return href;
}

export function createDocLink(
  page: Page | LoaderOutput<LoaderConfig>['$inferPage'],
): FC<ComponentProps<'a'>> {
  const RelativeLink = createRelativeLink(source, page);

  return function DocLink({ href, ...props }) {
    const normalized = href ? normalizeBareMarkdownHref(href) : href;
    return <RelativeLink href={normalized} {...props} />;
  };
}
