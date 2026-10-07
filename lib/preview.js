// True for the local preview (`npm start`), where drafts are shown. Eleventy
// sets ELEVENTY_RUN_MODE itself, so this works on every operating system.
export const isPreview = () =>
  process.env.ELEVENTY_ENV === "development" || ["serve", "watch"].includes(process.env.ELEVENTY_RUN_MODE);
