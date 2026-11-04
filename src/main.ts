import './style.css'
import { GlassApp } from './glass/app'

function waitForNextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

async function main() {
  const appRoot = document.getElementById('app')
  const loadingOverlay = document.getElementById('loadingOverlay')
  const githubLink = document.querySelector<HTMLAnchorElement>('.github-link')
  const mainCanvas = document.getElementById('mainCanvas') as HTMLCanvasElement | null
  const displacementCanvas = document.getElementById('displacementMap') as HTMLCanvasElement | null

  if (!appRoot || !loadingOverlay || !githubLink || !mainCanvas || !displacementCanvas) {
    throw new Error('Canvas elements not found')
  }

  try {
    await new GlassApp(mainCanvas, displacementCanvas).start()
    await waitForNextFrame()
    appRoot.classList.add('scene-loaded')
    githubLink.removeAttribute('style')
  } catch (error) {
    console.error(error)
    appRoot.classList.add('scene-load-error')
    const message = navigator.gpu
      ? 'The scene could not load. Reload the page, and if that fails, check that hardware acceleration is on.'
      : 'This browser has WebGPU turned off. Open the page in a recent Chrome or Edge, or turn on hardware acceleration.'
    loadingOverlay.setAttribute('aria-label', message)
    loadingOverlay.querySelector('.loading-message')?.replaceChildren(message)
  }
}

main().catch((error) => {
  console.error(error)
})
