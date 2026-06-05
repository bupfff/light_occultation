export const videoTemplate = `
<div class="video-background" data-background="video">
  <video class="video-background-media" muted loop playsinline preload="auto"></video>
</div>
`

export interface VideoTemplateOptions {
  videoUrl: string
}

export function createVideoElement(options: VideoTemplateOptions): HTMLElement {
  const template = document.createElement('template')
  template.innerHTML = videoTemplate.trim()

  const element = template.content.firstElementChild!.cloneNode(true) as HTMLElement
  const video = element.querySelector('.video-background-media') as HTMLVideoElement | null

  if (video && options.videoUrl) {
    video.src = options.videoUrl
  }

  return element
}
