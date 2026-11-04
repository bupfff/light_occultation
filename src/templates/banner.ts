export const bannerTemplate = `
<div class="banner-background" data-background="banner">
  <img class="banner-img" alt="Banner" />
  <div class="banner-copy">
    <h1 class="banner-title">Light Occultation</h1>
    <p class="banner-body">When one body crosses in front of a light, its edge blocks and bends what lies behind it.</p>
    <p class="banner-body">Drag a lens across this page, or sketch one of your own.</p>
  </div>
</div>
`

export interface BannerTemplateOptions {
  imageUrl: string
}

export function createBannerElement(options: BannerTemplateOptions): HTMLElement {
  const template = document.createElement('template')
  template.innerHTML = bannerTemplate.trim()

  const element = template.content.firstElementChild!.cloneNode(true) as HTMLElement

  const img = element.querySelector('.banner-img') as HTMLImageElement
  if (img && options.imageUrl) {
    img.src = options.imageUrl
  }

  return element
}
