/**
 * The text sizes a reader can choose, smallest first. Applied through
 * `--text-scale` in index.css, from `<html data-font-size>`.
 *
 * A module of its own because both the store's normaliser and the sync read
 * it, and those two already import each other's neighbours.
 */
export const FONT_SIZES = ['small', 'default', 'large']
