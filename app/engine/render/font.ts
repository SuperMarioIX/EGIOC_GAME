import { Material } from './material';
import { QuadP3T2C4 } from './quad';
import { SymbolData } from './symbol-data';

export class Font {
  fontData: { [key: string]: SymbolData } = {};
  material: Material = new Material();

  maxSymbolHeight: number = 0;

  getSymbolQuad(symbol: string, scale: number): QuadP3T2C4 {
    const quad = new QuadP3T2C4();
    const symbolData = this.fontData[symbol];
    if (!symbolData) {
      return quad;
    }

    quad.positions[0].set(symbolData.width, symbolData.startY + symbolData.height, 0).multiplyNumSelf(scale);
    quad.positions[1].set(symbolData.width, symbolData.startY, 0).multiplyNumSelf(scale);
    quad.positions[2].set(0, symbolData.startY, 0).multiplyNumSelf(scale);
    quad.positions[3].set(0, symbolData.startY + symbolData.height, 0).multiplyNumSelf(scale);

    quad.texCoords[0].set(symbolData.tx + symbolData.tw, symbolData.ty + symbolData.th);
    quad.texCoords[1].set(symbolData.tx + symbolData.tw, symbolData.ty);
    quad.texCoords[2].set(symbolData.tx, symbolData.ty);
    quad.texCoords[3].set(symbolData.tx, symbolData.ty + symbolData.th);

    return quad;
  }

  hasFontData(symbol: string): boolean {
    return this.fontData[symbol] ? true : false;
  }

  getTextLength(text: string, withTrailingSpace: boolean = true): number {
    let length = 0;
    let fontData: SymbolData;
    for (const symbol of text) {
      fontData = this.fontData[symbol];
      length += fontData ? fontData.width : 0;
    }

    if (withTrailingSpace) {
      length += this.fontData[' '].width;
    }

    return length;
  }
}
