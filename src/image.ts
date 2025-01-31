import { Text2Image, Image2Image } from './interface'
import { getTextSize, ErrorMsg } from './utils'

class ImageWaterMark {
  config: Text2Image | Image2Image
  canvas!: HTMLCanvasElement

  constructor(config: Text2Image | Image2Image, wmType: string) {
    this.config = config

    this.initTargetCanvas()

    if (wmType === 'image') {
      this.image2canvas()
    } else {
      this.text2canvas()
    }
  }

  // 将目标图片放到caanvas
  initTargetCanvas() {
    const img = this.config.target

    const canvas = document.createElement('canvas')
    const { width, height } = img
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height)
      this.canvas = canvas
    } else {
      this.config.onerror && this.config.onerror(ErrorMsg.NoSupportCanvas())
    }
  }

  text2canvas() {
    if (this.config.secret) {
      // 画暗水印
      this.drawEncryptedText2canvas()
    } else {
      // 画明水印
      this.drawSurfaceText2canvas()
    }
  }

  image2canvas: () => void = async () => {
    const { image, position, target, success, imageWidth, imageHeight } = this.config as Image2Image
    const img = await this._url2img(image, imageWidth, imageHeight)

    const { width: newImgWidth, height: newImgHeight } = img
    const { width, height } = this.canvas

    const ctx = this.canvas.getContext('2d')

    if (ctx) {
      switch (position) {
        case 'repeat':
          let w = 0
          let h = 0
          while (h < height) {
            while (w < width) {
              ctx.drawImage(img, w, h, newImgWidth, newImgHeight)
              w += newImgWidth
            }
            w = 0
            h += newImgHeight
          }
          break
        case 'center':
          ctx.drawImage(
            img,
            (width - newImgWidth) / 2,
            (height - newImgHeight) / 2,
            newImgWidth,
            newImgHeight
          )
          break
        case 'topLeft':
          ctx.drawImage(img, 0, 0, newImgWidth, newImgHeight)
          break
        case 'topRight':
          ctx.drawImage(img, width - newImgWidth, 0, newImgWidth, newImgHeight)
          break
        case 'bottomRight':
          ctx.drawImage(img, width - newImgWidth, height - newImgHeight, newImgWidth, newImgHeight)
          break
        case 'bottomLeft':
          ctx.drawImage(img, 0, height - newImgHeight, newImgWidth, newImgHeight)
          break
      }
      const base64 = this.canvas.toDataURL()
      target.src = base64
      success && success(base64)
    }
  }

  drawEncryptedText2canvas() {
    const { width, height } = this.canvas
    const ctx = this.canvas.getContext('2d')
    if (ctx) {
      const targetImageData = ctx.getImageData(0, 0, width, height)
      const textImageData = this._text2ImageData(this.config as Text2Image, width, height)
      const watermarkImageData = this._encryptAndMergeImageData(targetImageData, textImageData)
      ctx.putImageData(watermarkImageData, 0, 0)
      const base64 = this.canvas.toDataURL()
      this.config.target.src = base64
      this.config.success && this.config.success(base64)
    }
  }

  drawSurfaceText2canvas() {
    const config = this.config as Text2Image
    const { width, height } = this.canvas
    const ctx = this.canvas.getContext('2d')
    if (ctx) {
      this._fillText2Ctx(ctx, config, width, height)
      const base64 = this.canvas.toDataURL()
      this.config.target.src = base64
      this.config.success && this.config.success(base64)
    }
  }

  _url2img(src: string, width?: number, height?: number) {
    const img = new Image(width, height)
    img.setAttribute('crossorigin', 'crossorigin')
    img.src = src
    return new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => {
        resolve(img)
      }
      img.onerror = () => {
        reject(new Image())
      }
    })
  }

  _text2ImageData(config: Text2Image, width: number, height: number) {
    let data = new ImageData(1, 1)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    if (ctx) {
      this._fillText2Ctx(ctx, config, width, height)
      data = ctx.getImageData(0, 0, width, height)
    }

    return data
  }

  _fillText2Ctx(
    ctx: CanvasRenderingContext2D,
    textConfig: Text2Image,
    width: number,
    height: number
  ) {
    let { position, color, fontSize, cSpace, vSpace, angle, text } = textConfig
    ctx.font = `${fontSize}px microsoft yahei`
    ctx.fillStyle = color

    switch (position) {
      case 'center':
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, width / 2, height / 2)
        break
      case 'topLeft':
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(text, 0 + cSpace, 0 + vSpace)
        break
      case 'topRight':
        ctx.textAlign = 'right'
        ctx.textBaseline = 'top'
        ctx.fillText(text, width - cSpace, 0 + vSpace)
        break
      case 'bottomRight':
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillText(text, width - cSpace, height - vSpace)
        break
      case 'bottomLeft':
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.fillText(text, 0 + cSpace, height - vSpace)
        break
      default:
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const { width: textWith } = getTextSize(text, fontSize)
        const wmWidth = textWith + cSpace
        const wmHeight = textWith + vSpace
        ctx.translate(width / 2, height / 2)
        ctx.rotate((Math.PI / 180) * angle)

        const diagonal = Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2))

        let w = -diagonal / 2
        let h = -diagonal / 2

        while (h < diagonal / 2) {
          while (w < diagonal / 2) {
            ctx.fillText(text, w, h)
            w += wmWidth
          }
          w = -diagonal / 2
          h += wmHeight
        }
    }
  }

  _encryptAndMergeImageData(targetData: ImageData, textData: ImageData, rgb?: string) {
    const oData = targetData.data
    const tData = textData.data

    let bit
    let offset

    switch (rgb) {
      case 'G':
        bit = 1
        offset = 2
        break
      case 'B':
        bit = 2
        offset = 1
        break
      default:
        bit = 0
        offset = 3
    }

    for (let i = 0; i < oData.length; i++) {
      if (i % 4 === bit) {
        // 对目标通道：文字为空的地方 原图处理为偶数；文字不为空的地方，原图处理为奇数
        if (tData[i + offset] === 0 && oData[i] % 2 === 1) {
          // 文字为空为原图为奇数 -> 变为偶数
          if (oData[i] === 255) {
            oData[i]--
          } else {
            oData[i]++
          }
        } else if (tData[i + offset] !== 0 && oData[i] % 2 === 0) {
          // 文字不为空，原图为偶数 -> 变为奇数
          oData[i]++
        }
      }
    }

    return targetData
  }
}

export default ImageWaterMark
