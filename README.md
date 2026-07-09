# Finger Magic Lite

Finger Magic Lite is a static browser camera experiment. It uses MediaPipe Hand Landmarker to detect two hands, pairs matching thumb, index, middle, and pinky fingertips, then renders three comic-style WebGL effect zones between adjacent finger pairs.

## Run

```bash
npm install
npm run serve
```

Open `http://127.0.0.1:4173/` in Chrome or Edge and allow camera access.

## Test

```bash
npm test
```

## Use

Show both hands to the camera. The app pairs left/right thumb, index, middle, and pinky fingertips, then creates these three regions:

- Thumb to Index
- Index to Middle
- Middle to Pinky

The three selectors choose one comic shader per region. Available filters are `热力海报`, `黑白墨线`, `日漫网点`, `赛璐璐动画`, `美式波普`, `彩色漫画`, `错版孔版印刷`, `蓝图线稿`, `报纸半调`, and `故障印刷`. Enable `Debug` to see the detected region wireframes.

## Notes

- This project is frontend-only: native HTML, CSS, and JavaScript.
- It has no login, upload, backend, deployment step, or color/glove fallback detector.
- Camera access usually requires `localhost`, `127.0.0.1`, or HTTPS.
