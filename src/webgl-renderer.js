const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_uv;

uniform vec2 u_resolution;
uniform int u_mirror;

varying vec2 v_uv;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  v_uv = u_mirror == 1 ? vec2(1.0 - a_uv.x, a_uv.y) : a_uv;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_video;
uniform int u_mode;
uniform int u_region;
uniform int u_filtered;
uniform vec2 u_texel;
uniform float u_time;

varying vec2 v_uv;

vec3 sampleVideo(vec2 uv) {
  return texture2D(u_video, clamp(uv, 0.0, 1.0)).rgb;
}

float luminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float edgeMask(vec2 uv) {
  vec3 center = sampleVideo(uv);
  vec3 right = sampleVideo(uv + vec2(u_texel.x * 2.4, 0.0));
  vec3 down = sampleVideo(uv + vec2(0.0, u_texel.y * 2.4));
  return smoothstep(0.12, 0.44, length(center - right) + length(center - down));
}

float halftone(vec2 uv, float scale) {
  vec2 cell = fract(uv * scale) - 0.5;
  float shade = luminance(sampleVideo(uv));
  float dotSize = 0.36 * (1.0 - shade) + 0.05;
  return 1.0 - smoothstep(dotSize, dotSize + 0.018, length(cell));
}

float diagonalLines(vec2 uv, float scale, float width) {
  float line = abs(fract((uv.x + uv.y + u_time * 0.18) * scale) - 0.5);
  return 1.0 - smoothstep(width, width + 0.014, line);
}

float crossHatch(vec2 uv, float value) {
  float hatchA = diagonalLines(uv, 54.0, 0.018);
  float hatchB = diagonalLines(vec2(uv.x, 1.0 - uv.y), 42.0, 0.015);
  return max(hatchA, hatchB) * (1.0 - value);
}

vec3 posterize(vec3 color, float levels) {
  return floor(color * levels) / max(levels - 1.0, 1.0);
}

vec3 posterHeat(vec2 uv) {
  vec3 color = sampleVideo(uv);
  float value = luminance(color);
  vec3 cold = vec3(0.02, 0.12, 0.72);
  vec3 mid = vec3(0.0, 0.88, 0.48);
  vec3 hot = vec3(1.0, 0.12, 0.04);
  vec3 heatColor = mix(cold, mid, smoothstep(0.0, 0.58, value));
  heatColor = mix(heatColor, hot, smoothstep(0.52, 1.0, value));
  float dots = halftone(uv * vec2(1.2, 1.0), 52.0);
  float edge = edgeMask(uv);
  return floor(heatColor * 5.0) / 4.0 + vec3(dots * 0.14) - vec3(edge * 0.24, edge * 0.12, 0.0);
}

vec3 noirInk(vec2 uv) {
  float value = luminance(sampleVideo(uv));
  float edge = edgeMask(uv);
  float ink = 1.0 - smoothstep(0.28, 0.62, value);
  float shadows = smoothstep(0.78, 0.34, value);
  float hatch = crossHatch(uv + vec2(float(u_region) * 0.015, 0.0), value);
  float linework = clamp(max(edge * 1.4, max(ink * 0.72, hatch * 0.9)) + shadows * 0.28, 0.0, 1.0);
  vec3 paper = vec3(0.96, 0.94, 0.86);
  vec3 black = vec3(0.015, 0.014, 0.018);
  return mix(paper, black, linework);
}

vec3 mangaScreentone(vec2 uv) {
  vec3 color = sampleVideo(uv);
  float value = luminance(color);
  float toneDots = halftone(uv + vec2(float(u_region) * 0.021, 0.0), 86.0);
  float shadowTone = toneDots * smoothstep(0.78, 0.18, value);
  float edge = edgeMask(uv);
  float hatch = crossHatch(uv, value) * 0.42;
  vec3 paper = vec3(0.98, 0.97, 0.93);
  vec3 gray = mix(vec3(0.86), vec3(0.34), shadowTone + hatch);
  return mix(mix(paper, gray, 0.82), vec3(0.02), clamp(edge * 1.18, 0.0, 1.0));
}

vec3 animeCel(vec2 uv) {
  vec3 color = sampleVideo(uv);
  float value = luminance(color);
  vec3 cel = posterize(pow(color, vec3(0.82)) * vec3(1.1, 1.08, 1.16), 4.0);
  float shade = smoothstep(0.46, 0.2, value);
  float highlight = smoothstep(0.68, 0.92, value);
  float edge = edgeMask(uv);
  vec3 shadow = cel * vec3(0.48, 0.54, 0.72);
  vec3 lit = mix(cel, vec3(1.0, 0.92, 0.68), highlight * 0.28);
  return mix(mix(lit, shadow, shade * 0.52), vec3(0.02, 0.025, 0.04), clamp(edge * 1.08, 0.0, 1.0));
}

vec3 americanPop(vec2 uv) {
  vec3 color = sampleVideo(uv);
  float value = luminance(color);
  float dots = halftone(uv + vec2(float(u_region) * 0.019, 0.0), 68.0);
  float edge = edgeMask(uv);
  vec3 red = vec3(0.95, 0.04, 0.08);
  vec3 blue = vec3(0.02, 0.22, 0.95);
  vec3 yellow = vec3(1.0, 0.86, 0.08);
  vec3 pop = mix(blue, red, smoothstep(0.22, 0.72, color.r + color.g * 0.35));
  pop = mix(pop, yellow, smoothstep(0.58, 0.96, value) * 0.58);
  pop = posterize(pop + vec3(dots * 0.16), 4.0);
  return mix(pop, vec3(0.01, 0.01, 0.03), clamp(edge * 1.12, 0.0, 1.0));
}

vec3 webComic(vec2 uv) {
  vec3 color = sampleVideo(uv);
  float value = luminance(color);
  float dots = halftone(uv * vec2(1.08, 1.0) + vec2(float(u_region) * 0.017, 0.0), 58.0);
  float edge = edgeMask(uv);
  vec3 cyan = vec3(0.0, 0.78, 1.0);
  vec3 red = vec3(1.0, 0.08, 0.18);
  vec3 yellow = vec3(1.0, 0.88, 0.05);
  vec3 violet = vec3(0.08, 0.0, 0.22);
  vec3 comic = mix(violet, cyan, smoothstep(0.12, 0.72, color.b + color.g * 0.35));
  comic = mix(comic, red, smoothstep(0.34, 0.88, color.r));
  comic = mix(comic, yellow, smoothstep(0.66, 0.96, value) * 0.68);
  comic = posterize(comic, 5.0) + vec3(dots * 0.12);
  return mix(comic, vec3(0.012, 0.01, 0.018), clamp(edge * 1.26, 0.0, 1.0));
}

vec3 risoMisprint(vec2 uv) {
  vec2 wobble = vec2(sin((uv.y + u_time * 0.15) * 42.0), cos((uv.x - u_time * 0.12) * 34.0)) * 0.003;
  vec3 base = sampleVideo(uv);
  float value = luminance(base);
  float warm = luminance(sampleVideo(uv + wobble) * vec3(1.18, 0.58, 0.2));
  float cool = luminance(sampleVideo(uv - wobble * 1.4) * vec3(0.12, 0.7, 1.2));
  float grain = halftone(uv + vec2(0.013, float(u_region) * 0.021), 48.0);
  float edge = edgeMask(uv);
  vec3 paper = vec3(0.96, 0.9, 0.76);
  vec3 orange = vec3(1.0, 0.28, 0.12) * smoothstep(0.12, 0.84, warm);
  vec3 teal = vec3(0.0, 0.62, 0.68) * smoothstep(0.18, 0.86, cool);
  vec3 ink = paper * 0.52 + orange * 0.62 + teal * 0.68 + vec3(grain * 0.08);
  return mix(ink, vec3(0.04, 0.025, 0.02), clamp(edge * (0.52 + (1.0 - value) * 0.42), 0.0, 1.0));
}

vec3 blueprintInk(vec2 uv) {
  float value = luminance(sampleVideo(uv));
  float edge = edgeMask(uv);
  float gridA = 1.0 - smoothstep(0.012, 0.018, abs(fract(uv.x * 18.0) - 0.5));
  float gridB = 1.0 - smoothstep(0.012, 0.018, abs(fract(uv.y * 18.0) - 0.5));
  float sketch = max(edge * 1.32, crossHatch(uv, value) * 0.64);
  vec3 blue = vec3(0.02, 0.12, 0.42);
  vec3 line = vec3(0.72, 0.94, 1.0);
  float grid = max(gridA, gridB) * 0.1;
  return mix(blue + vec3(grid), line, clamp(sketch + smoothstep(0.82, 0.98, value) * 0.18, 0.0, 1.0));
}

vec3 newspaperHalftone(vec2 uv) {
  vec3 color = sampleVideo(uv);
  float value = luminance(color);
  float coarseDots = halftone(uv + vec2(float(u_region) * 0.011, 0.0), 42.0);
  float edge = edgeMask(uv);
  vec3 paper = vec3(0.92, 0.86, 0.72);
  vec3 faded = mix(vec3(0.18, 0.16, 0.12), vec3(0.78, 0.66, 0.42), smoothstep(0.18, 0.86, value));
  vec3 ink = mix(faded, vec3(0.08, 0.07, 0.06), coarseDots * (1.0 - value) * 0.84);
  return mix(mix(paper, ink, 0.84), vec3(0.02, 0.018, 0.014), clamp(edge * 0.92, 0.0, 1.0));
}

vec3 glitchPrint(vec2 uv) {
  float strip = step(0.78, fract((uv.y + u_time * 0.22) * 18.0));
  float jitter = (sin((uv.y + float(u_region) * 0.07) * 96.0 + u_time * 4.0) * 0.006) + strip * 0.018;
  vec2 shift = vec2(jitter, 0.0);
  float r = sampleVideo(uv + shift).r;
  float g = sampleVideo(uv + vec2(-shift.x * 0.34, shift.x * 0.18)).g;
  float b = sampleVideo(uv - shift).b;
  vec3 color = vec3(r, g, b);
  float scan = 1.0 - smoothstep(0.02, 0.032, abs(fract((uv.y + u_time * 0.08) * 72.0) - 0.5));
  float edge = edgeMask(uv);
  return posterize(color * vec3(1.38, 1.16, 1.52), 5.0) + vec3(scan * 0.12, strip * 0.1, edge * 0.34);
}

vec3 punkAesthetic(vec2 uv) {
  vec3 color = sampleVideo(uv);
  float value = luminance(color);
  float gray = value * 0.85;
  vec3 nr = vec3(gray + 0.078, gray * 0.9 + 0.059, gray * 0.7 + 0.039);
  float contrast = (value - 0.5) * 1.4 + 0.5;
  if (contrast > 0.705) {
    nr = vec3(0.863 + (fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.078,
              0.118 + (fract(sin(dot(uv + 1.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.059,
              0.118 + (fract(sin(dot(uv + 2.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.059);
  } else if (contrast < 0.275) {
    nr = vec3(0.098, 0.059, 0.059);
  }
  float grain = (fract(sin(dot(uv * 100.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.137;
  nr += vec3(grain);
  float splatterRand = fract(sin(dot(uv * 500.0, vec2(12.9898, 78.233))) * 43758.5453);
  if (splatterRand < 0.003) {
    float splatter = (fract(sin(dot(uv * 1000.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.314;
    nr += vec3(splatter);
  }
  float texNoise = (sin(uv.x * 30.0) * cos(uv.y * 40.0)) * 0.047;
  nr += vec3(texNoise);
  return clamp(nr, 0.0, 1.0);
}

void main() {
  vec3 color = sampleVideo(v_uv);

  if (u_filtered == 1) {
    if (u_mode == 0) {
      color = posterHeat(v_uv);
    } else if (u_mode == 1) {
      color = noirInk(v_uv);
    } else if (u_mode == 2) {
      color = mangaScreentone(v_uv);
    } else if (u_mode == 3) {
      color = animeCel(v_uv);
    } else if (u_mode == 4) {
      color = americanPop(v_uv);
    } else if (u_mode == 5) {
      color = webComic(v_uv);
    } else if (u_mode == 6) {
      color = risoMisprint(v_uv);
    } else if (u_mode == 7) {
      color = blueprintInk(v_uv);
    } else if (u_mode == 8) {
      color = newspaperHalftone(v_uv);
    } else if (u_mode == 9) {
      color = glitchPrint(v_uv);
    } else {
      color = punkAesthetic(v_uv);
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
  }

  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
  }

  return program;
}

export class FingerMagicRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: false
    });

    if (!this.gl) {
      throw new Error("WebGL is not available in this browser.");
    }

    const gl = this.gl;
    this.program = createProgram(gl);
    this.positionBuffer = gl.createBuffer();
    this.uvBuffer = gl.createBuffer();
    this.texture = gl.createTexture();

    this.locations = {
      position: gl.getAttribLocation(this.program, "a_position"),
      uv: gl.getAttribLocation(this.program, "a_uv"),
      resolution: gl.getUniformLocation(this.program, "u_resolution"),
      mirror: gl.getUniformLocation(this.program, "u_mirror"),
      video: gl.getUniformLocation(this.program, "u_video"),
      mode: gl.getUniformLocation(this.program, "u_mode"),
      region: gl.getUniformLocation(this.program, "u_region"),
      filtered: gl.getUniformLocation(this.program, "u_filtered"),
      texel: gl.getUniformLocation(this.program, "u_texel"),
      time: gl.getUniformLocation(this.program, "u_time")
    };

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  render({ video, quads }) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.02, 0.02, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.uniform1i(this.locations.video, 0);
    gl.uniform2f(this.locations.resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.locations.texel, 1 / video.videoWidth, 1 / video.videoHeight);
    gl.uniform1f(this.locations.time, performance.now() / 1000);

    this.drawFullFrame();

    for (let index = 0; index < quads.length; index += 1) {
      this.drawQuad(quads[index].points, quads[index].effectIndex, index);
    }
  }

  drawFullFrame() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const positions = new Float32Array([
      0, 0,
      width, 0,
      0, height,
      0, height,
      width, 0,
      width, height
    ]);
    const uvs = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1
    ]);

    this.drawTriangles(positions, uvs, { filtered: false, mirror: true });
  }

  drawQuad(points, effectIndex, regionIndex) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const toCanvas = (point) => [(1 - point.x) * width, point.y * height];
    const [a, b, c, d] = points.map(toCanvas);

    const positions = new Float32Array([
      ...a,
      ...b,
      ...d,
      ...d,
      ...b,
      ...c
    ]);

    const uvs = new Float32Array([
      points[0].x, points[0].y,
      points[1].x, points[1].y,
      points[3].x, points[3].y,
      points[3].x, points[3].y,
      points[1].x, points[1].y,
      points[2].x, points[2].y
    ]);

    this.drawTriangles(positions, uvs, {
      filtered: true,
      mirror: false,
      mode: effectIndex,
      region: regionIndex
    });
  }

  drawTriangles(positions, uvs, { filtered, mirror, mode = 0, region = 0 }) {
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.locations.uv);
    gl.vertexAttribPointer(this.locations.uv, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1i(this.locations.filtered, filtered ? 1 : 0);
    gl.uniform1i(this.locations.mirror, mirror ? 1 : 0);
    gl.uniform1i(this.locations.mode, mode);
    gl.uniform1i(this.locations.region, region);
    gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
  }
}
