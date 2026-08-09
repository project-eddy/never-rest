import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Private GitHub Pages serves at the unique pages.github.io root (not /never-rest).
  // Re-add basePath/assetPrefix '/never-rest' if the repo becomes public
  // (project-eddy.github.io/never-rest).
  reactStrictMode: true,
};

export default withMDX(config);
