import { Input, INPUT } from '../input/input';
import { InputEvent } from '../input/input-event';
import { InputType } from '../input/input-type.enum';
import { Keys, MouseButtons } from '../input/keys.enum';
import { Vector2 } from '../math/vector2';
import { Vector4 } from '../math/vector4';
import { FrameBuffer } from './frame-buffer';
import { IndexBuffer } from './index-buffer';
import { Material } from './material';
import { RenderParams } from './render-params';
import { ShaderProgram } from './shader-program';
import { Texture } from './texture';
import { VertexBuffer } from './vertex-buffer';
import { gl, WebGLRegisterService } from './webgl';
import { BlendingMode, ClearMask, CullMode, FuncComparison, IndexFormat, VertexFormat } from './webgl-types';

const TEXTURE_SAMPLERS_MAX = 8;

export class WebGLRenderer {
  public renderParams: RenderParams = new RenderParams();

  public get textureBinds(): number { return this._statTextureBind; }
  public get triCount(): number { return this._statTriCount; }
  public get dipCount(): number { return this._statDIPCount; }

  public get width(): number { return this._width; }
  public get height(): number { return this._height; }

  private _screenQuadVB: VertexBuffer;
  private _screenQuadIB: IndexBuffer;

  private _blendingMode: BlendingMode = BlendingMode.None;
  private _cullMode: CullMode;

  private _depthWrite: boolean = false;
  private _depthTest: boolean = false;
  private _depthFunc: FuncComparison = FuncComparison.Never;

  private _shader: ShaderProgram | null;
  private _textureSampler: Array<Texture | null> = new Array<Texture>(TEXTURE_SAMPLERS_MAX);
  private _activeSampler: number;
  private _vertexBuffer: VertexBuffer | null;
  private _indexBuffer: IndexBuffer | null;
  private _frameBuffer: FrameBuffer | null;

  private _statTextureBind: number = 0;
  private _statTriCount: number = 0;
  private _statDIPCount: number = 0;

  private _width: number;
  private _height: number;

  constructor(
    private canvasElement: HTMLCanvasElement,
  ) {
    const glContext = (
      canvasElement.getContext('webgl') ||
      canvasElement.getContext('experimental-webgl')
    ) as WebGLRenderingContext;

    if (!glContext) {
      console.log('GL initialize failed');
      return;
    }

    WebGLRegisterService.registerWebGLContext(glContext);
    WebGLRegisterService.registerWebGLRenderer(this);

    this.initWebGL();
    this.createScreenQuad();
    this.initEvents();

    canvasElement.focus();
  }

  public onMouseMove: (position: Vector2) => void = p => {};
  public onMouseDown: (position: Vector2, button: MouseButtons) => void = (p, b) => {};
  public onMouseUp: (position: Vector2, button: MouseButtons) => void = (p, b) => {};
  public onKeyDown: (key: Keys) => void = k => {};
  public onKeyUp: (key: Keys) => void = k => {};

  public free(): void {
    this._screenQuadVB.free();
    this._screenQuadIB.free();
  }

  public resize(width: number, height: number): void {
    this.setViewPort(0, 0, width, height);
  }

  public resetStates(): void {
    this.setCullMode(CullMode.Back);
    this.setBlendingMode(BlendingMode.Alpha);
    this.setDepthFunc(FuncComparison.LessOrEqual);
    this.setDepthWrite(true);
    this.setDepthTest(true);

    this._activeSampler = -1;

    for (let i = 0; i < TEXTURE_SAMPLERS_MAX; ++i) {
      this._textureSampler[i] = null;
    }

    this._shader = null;
    this._vertexBuffer = null;
    this._indexBuffer = null;
    this._frameBuffer = null;

    this.renderParams.color.set(1, 1, 1, 1);
    this.renderParams.viewProjection.identity();
    this.renderParams.model.identity();
  }

  public resetStatistics(): void {
    this._statDIPCount = 0;
    this._statTextureBind = 0;
    this._statTriCount = 0;
  }

  public clear(clearMask: ClearMask): void {
    switch (clearMask) {
      // tslint:disable-next-line:no-bitwise
      case ClearMask.All: gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); break;
      case ClearMask.Color: gl.clear(gl.COLOR_BUFFER_BIT); break;
      case ClearMask.Depth: gl.clear(gl.DEPTH_BUFFER_BIT); break;
    }
  }

  public setClearColor(v: Vector4): void {
    gl.clearColor(v.x, v.y, v.z, v.w);
  }

  public setClearColorRGB(r: number, g: number, b: number, a: number): void {
    gl.clearColor(r, g, b, a);
  }

  public setViewPort(left: number, top: number, width: number, height: number): void {
    this._width = width;
    this._height = height;
    gl.viewport(left, top, width, height);
  }

  public setCullMode(cullMode: CullMode): void {
    if (cullMode === this._cullMode) { return; }

    switch (cullMode) {
      case CullMode.None: gl.disable(gl.CULL_FACE); break;
      case CullMode.Front: gl.cullFace(gl.FRONT); break;
      case CullMode.Back: gl.cullFace(gl.BACK); break;
    }

    // If PREVIOUS state was None we should enable CullFace now
    if (this._cullMode === CullMode.None) {
      gl.enable(gl.CULL_FACE);
    }

    this._cullMode = cullMode;
  }

  public setBlendingMode(blendingMode: BlendingMode): void {
    if (blendingMode === this._blendingMode) { return; }

    switch (blendingMode) {
      case BlendingMode.None: gl.disable(gl.BLEND); break;
      case BlendingMode.Alpha: gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); break;
      case BlendingMode.Additive: gl.blendFunc(gl.ONE, gl.ONE); break;
      case BlendingMode.Multiply: gl.blendFunc(gl.DST_COLOR, gl.ZERO); break;
      case BlendingMode.Screen: gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); break;
    }

    // If PREVIOUS state was None we should enable blend now
    if (this._blendingMode === BlendingMode.None) {
      gl.enable(gl.BLEND);
    }

    this._blendingMode = blendingMode;
  }

  public setDepthWrite(enabled: boolean): void {
    if (enabled === this._depthWrite) { return; }

    gl.depthMask(enabled);
    this._depthWrite = enabled;
  }

  public setDepthTest(enabled: boolean): void {
    if (enabled === this._depthTest) { return; }

    if (enabled) {
      gl.enable(gl.DEPTH_TEST);
    } else {
      gl.disable(gl.DEPTH_TEST);
    }

    this._depthTest = enabled;
  }

  public setDepthFunc(comparison: FuncComparison): void {
    if (comparison === this._depthFunc) { return; }

    gl.depthFunc(this.getWebGLComparison(comparison));
    this._depthFunc = comparison;
  }

  public setShader(shader: ShaderProgram): void {
    if (shader === this._shader) { return; }

    gl.useProgram(shader.program);
    this._shader = shader;
  }

  public setTexture(texture: Texture | null, sampler: number): void {
    if (this._textureSampler[sampler] === texture) { return; }

    if (this._activeSampler !== sampler) {
      gl.activeTexture(gl.TEXTURE0 + sampler);
      this._activeSampler = sampler;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture === null ? null : texture.texture);

    this._textureSampler[sampler] = texture;
    ++this._statTextureBind;
  }

  public setVertexBuffer(vertexBuffer: VertexBuffer | null): void {
    if (!vertexBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      return;
    }

    if (vertexBuffer === this._vertexBuffer) { return; }

    vertexBuffer.bind();
    this._vertexBuffer = vertexBuffer;
  }

  public setIndexBuffer(indexBuffer: IndexBuffer): void {
    if (!indexBuffer) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      return;
    }

    if (indexBuffer === this._indexBuffer) { return; }

    indexBuffer.bind();
    this._indexBuffer = indexBuffer;
  }

  public drawTriangles(
    vertexBuffer: VertexBuffer, indexBuffer: IndexBuffer,
    startIndex: number, indicesCount: number,
  ): void {
    this.setVertexBuffer(vertexBuffer);
    this.setIndexBuffer(indexBuffer);

    gl.drawElements(
      gl.TRIANGLES,
      indicesCount,
      IndexBuffer.getWebGLFormat(indexBuffer.format),
      startIndex * IndexBuffer.getSizeFromFormat(indexBuffer.format),
    );

    ++this._statDIPCount;
    this._statTriCount += Math.floor(indicesCount / 3);
  }

  public drawScreenQuad(material: Material): void {
    this.renderParams.viewProjection.ortho(0, 1, 1, 0, -1, 1);
    this.renderParams.modelViewProjection = this.renderParams.viewProjection;

    material.bind();
    this.clear(ClearMask.All);
    this.drawTriangles(this._screenQuadVB, this._screenQuadIB, 0, 6);
  }

  private initWebGL(): void {
    const logInfo = `
      Graphics information:
      Vendor: ${gl.getParameter(gl.VENDOR)}
      Renderer: ${gl.getParameter(gl.RENDERER)}
      OpenGL: ${gl.getParameter(gl.VERSION)}
      GLSL: ${gl.getParameter(gl.SHADING_LANGUAGE_VERSION)}
      `;
    console.log(logInfo);

    gl.viewport(0, 0, this.canvasElement.width, this.canvasElement.height);
  }

  private initEvents(): void {
    const canvasWindowPosition = new Vector2(
      this.canvasElement.getBoundingClientRect().left,
      this.canvasElement.getBoundingClientRect().top,
    );

    const canvasSize = new Vector2(
      this.canvasElement.width,
      this.canvasElement.height,
    );

    this.canvasElement.onmousemove = event => {
      const inputEvent = this.getInputEventFromMouseEvent(event);
      INPUT.process(inputEvent);

      this.onMouseMove(new Vector2(
        event.pageX - canvasWindowPosition.x,
        event.pageY - canvasWindowPosition.y,
      ));
    };

    this.canvasElement.onmousedown = event => {
      event.preventDefault();
      this.canvasElement.focus();
      const inputEvent = this.getInputEventFromMouseEvent(event);
      INPUT.process(inputEvent);

      this.onMouseDown(new Vector2(
        event.pageX - canvasWindowPosition.x,
        event.pageY - canvasWindowPosition.y,
      ), inputEvent.key as MouseButtons);
    };

    this.canvasElement.oncontextmenu = event => {
      event.preventDefault();
    }

    this.canvasElement.onmouseup = event => {
      const inputEvent = this.getInputEventFromMouseEvent(event);
      INPUT.process(inputEvent);

      this.onMouseUp(new Vector2(
        event.pageX - canvasWindowPosition.x,
        event.pageY - canvasWindowPosition.y,
      ), inputEvent.key as MouseButtons);
    };

    this.canvasElement.onwheel = event => {
      event.preventDefault();
      const inputEvent = this.getInputEventFromMouseEvent(event);
      INPUT.process(inputEvent);
    };

    this.canvasElement.onkeydown = event => {
      event.preventDefault();
      const inputEvent = this.getInputEventFromKeyEvent(event);
      INPUT.process(inputEvent);

      this.onKeyDown(inputEvent.key);
    };

    this.canvasElement.onkeyup = event => {
      event.preventDefault();
      const inputEvent = this.getInputEventFromKeyEvent(event);
      INPUT.process(inputEvent);

      this.onKeyUp(inputEvent.key);
    };

  }

  private createScreenQuad(): void {
    const vertexData = [
      /*pos*/ 1, 1, 1, /*tex*/ 1, 0, /*col*/ 1, 1, 1, 1,
      /*pos*/ 1, 0, 1, /*tex*/ 1, 1, /*col*/ 1, 1, 1, 1,
      /*pos*/ 0, 0, 1, /*tex*/ 0, 1, /*col*/ 1, 1, 1, 1,
      /*pos*/ 0, 1, 1, /*tex*/ 0, 0, /*col*/ 1, 1, 1, 1,
    ];

    const indexData = [0, 1, 2, 2, 3, 0];

    this._screenQuadVB = new VertexBuffer(VertexFormat.Pos3Tex2Col4, 4);
    this._screenQuadIB = new IndexBuffer(IndexFormat.Byte, 6);

    this._screenQuadVB.update(vertexData, 0);
    this._screenQuadIB.update(indexData, 0);
  }

  private getWebGLComparison(comparison: FuncComparison): number {
    switch (comparison) {
      case FuncComparison.Never: return gl.NEVER;
      case FuncComparison.Less: return gl.LESS;
      case FuncComparison.Equal: return gl.EQUAL;
      case FuncComparison.LessOrEqual: return gl.LEQUAL;
      case FuncComparison.Greater: return gl.GREATER;
      case FuncComparison.NotEqual: return gl.NOTEQUAL;
      case FuncComparison.GreaterOrEqual: return gl.GEQUAL;
      case FuncComparison.Always: return gl.ALWAYS;
    }
  }

  private getInputEventFromMouseEvent(event: MouseEvent | WheelEvent): InputEvent {
    let key: Keys;
    switch (event.button) {
      case 0: key = Keys.LeftButton; break;
      case 1: key = Keys.MiddleButton; break;
      case 2: key = Keys.RightButton; break;
      default: key = Keys.NoInput; break;
    }
    const x = event.pageX - this.canvasElement.getBoundingClientRect().left;
    const y = event.pageY - this.canvasElement.getBoundingClientRect().top;

    let type = InputType.TouchMove;
    let wheelDelta = 0;
    switch (event.type) {
      case 'mousedown': type = InputType.TouchDown; break;
      case 'mouseup': type = InputType.TouchUp; break;
      case 'mousemove': type = InputType.TouchMove; break;
      case 'wheel':
        type = InputType.Wheel;
        wheelDelta = (event as WheelEvent).deltaY;
        break;
    }

    return new InputEvent(type, key, x, y, wheelDelta);
  }

  private getInputEventFromKeyEvent(event: KeyboardEvent): InputEvent {
    let type = InputType.TouchMove;

    switch (event.type) {
      case 'keydown': type = InputType.KeyDown; break;
      case 'keyup': type = InputType.KeyUp; break;
    }

    const key: Keys = event.keyCode;

    return new InputEvent(type, key, 0, 0, 0);
  }
}
