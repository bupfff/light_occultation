export { articleTemplate, createArticleElement, type ArticleTemplateOptions } from './article'
export { bannerTemplate, createBannerElement, type BannerTemplateOptions } from './banner'
export { cssAnimationTemplate, createCssAnimationElement } from './css-animation'
export { videoTemplate, createVideoElement, type VideoTemplateOptions } from './video'

import { createArticleElement, type ArticleTemplateOptions } from './article'
import { createBannerElement, type BannerTemplateOptions } from './banner'
import { createCssAnimationElement } from './css-animation'
import { createVideoElement, type VideoTemplateOptions } from './video'
import type { BackgroundType } from '../webgpu/types'

export interface BackgroundTemplateOptions {
  article?: ArticleTemplateOptions
  banner?: BannerTemplateOptions
  video?: VideoTemplateOptions
}

export function createBackgroundElement(
  type: BackgroundType,
  options: BackgroundTemplateOptions = {}
): HTMLElement | null {
  switch (type) {
    case 'grid':
      return createCssAnimationElement()
    case 'article':
      return createArticleElement(options.article ?? { imageUrl: '' })
    case 'banner':
      return createBannerElement(options.banner ?? { imageUrl: '' })
    case 'video':
      return createVideoElement(options.video ?? { videoUrl: '' })
    default:
      return null
  }
}

export function isTemplateBackground(type: BackgroundType): boolean {
  return type === 'grid' || type === 'article' || type === 'banner'
}
