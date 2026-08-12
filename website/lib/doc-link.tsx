import type { ComponentProps, FC } from 'react';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { LoaderConfig, LoaderOutput, Page } from 'fumadocs-core/source';
import { source } from '@/lib/source';
import { gitConfig } from '@/lib/shared';

const githubTreeBase = `https://github.com/${gitConfig.user}/${gitConfig.repo}/tree/${gitConfig.branch}`;

/**
 * `docs/examples.md` links to `../examples/*` so paths work on GitHub; on the
 * static site those resolve outside the export. Point them at the repo tree.
 */
function rewriteExamplesRepoHref(href: string): string {
  if (!href.startsWith('../examples')) {
    return href;
  }

  const repoPath = href.replace(/^\.\.\//, '');
  return `${githubTreeBase}/${repoPath}`;
}

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
    const normalized = href
      ? rewriteExamplesRepoHref(normalizeBareMarkdownHref(href))
      : href;
    return <RelativeLink href={normalized} {...props} />;
  };
}
