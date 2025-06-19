// SVG를 XAML로 변환하는 Figma 플러그인

let isUIOpen = false;

// SVG 포맷팅 함수 (가독성을 위한 들여쓰기 추가)
function formatSvg(svgString) {
  // 기본 정리
  let formatted = svgString
    .trim()
    .replace(/\r?\n/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s+>/g, '>')
    .replace(/\s+\/>/g, '/>');
  
  // 들여쓰기를 위한 포맷팅
  formatted = formatted
    .replace(/></g, '>\n<')
    .replace(/<svg/g, '<svg')
    .replace(/<\/svg>/g, '\n</svg>')
    .replace(/<path/g, '  <path')
    .replace(/<circle/g, '  <circle')
    .replace(/<rect/g, '  <rect')
    .replace(/<defs>/g, '  <defs>')
    .replace(/<\/defs>/g, '  </defs>')
    .replace(/<clipPath/g, '    <clipPath')
    .replace(/<\/clipPath>/g, '    </clipPath>')
    .replace(/<g>/g, '  <g>')
    .replace(/<\/g>/g, '  </g>');
  
  return formatted;
}

// XAML 포맷팅 함수 (적절한 들여쓰기 적용)
function formatXaml(xamlString) {
  const lines = xamlString.split('\n');
  const formattedLines = [];
  let indentLevel = 0;
  
  for (let line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') continue;
    
    // 닫는 태그인 경우 들여쓰기 레벨 감소
    if (trimmedLine.startsWith('</')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }
    
    // 현재 들여쓰기 레벨로 라인 추가
    const indent = '    '.repeat(indentLevel);
    formattedLines.push(indent + trimmedLine);
    
    // 여는 태그이고 자체 닫기가 아닌 경우 들여쓰기 레벨 증가
    if (trimmedLine.startsWith('<') && 
        !trimmedLine.startsWith('</') && 
        !trimmedLine.endsWith('/>') &&
        !trimmedLine.includes('</')) {
      indentLevel++;
    }
  }
  
  return formattedLines.join('\n');
}

// SVG를 XAML로 변환하는 함수
function convertSvgToXaml(svgString) {
  try {
    // SVG 파싱
    const svgMatch = svgString.match(/<svg([^>]*?)>(.*?)<\/svg>/s);
    if (!svgMatch) {
      throw new Error('유효한 SVG 형식이 아닙니다');
    }
    
    const svgAttributes = svgMatch[1];
    const svgContent = svgMatch[2];
    
    // 그라데이션 정의 먼저 추출
    extractGradientDefinitions(svgContent);
    
    // width, height 추출
    const widthMatch = svgAttributes.match(/width=['"]([^'"]*)['"]/);
    const heightMatch = svgAttributes.match(/height=['"]([^'"]*)['"]/);
    
    const width = widthMatch ? widthMatch[1] : '100';
    const height = heightMatch ? heightMatch[1] : '100';
    
    // viewBox 추출
    const viewBoxMatch = svgAttributes.match(/viewBox=['"]([^'"]*)['"]/);
    const viewBox = viewBoxMatch ? viewBoxMatch[1] : `0 0 ${width} ${height}`;
    
    // SVG 요소의 기본 fill 속성 추출
    const svgFillMatch = svgAttributes.match(/fill=['"]([^'"]*)['"]/);
    const svgDefaultFill = svgFillMatch ? svgFillMatch[1] : null;
    
    // DrawingImage XAML 헤더 생성
    let xaml = `<DrawingImage x:Key="{{NODE_NAME}}">
<DrawingImage.Drawing>
<DrawingGroup>
`;
    
    // SVG 요소들을 XAML로 변환
    let convertedContent = convertSvgElementsToXaml(svgContent, svgDefaultFill);
    
    xaml += convertedContent;
    xaml += `</DrawingGroup>
</DrawingImage.Drawing>
</DrawingImage>`;
    
    // 포맷팅 적용
    return formatXaml(xaml);
    
  } catch (error) {
    console.error('XAML 변환 오류:', error);
    throw error;
  }
}

// SVG 요소들을 XAML로 변환하는 함수
function convertSvgElementsToXaml(svgContent, svgDefaultFill = null) {
  let xaml = '';
  
  // defs 섹션 제거 (clipPath, mask 등의 요소가 실제 요소로 변환되지 않도록)
  let processedSvgContent = svgContent;
  const defsContent = svgContent.match(/<defs[^>]*>[\s\S]*?<\/defs>/gi);
  if (defsContent) {
    defsContent.forEach(def => {
      processedSvgContent = processedSvgContent.replace(def, '');
    });
  }
  
  // path 요소 변환
  const pathRegex = /<path([^>]*?)\/?>(?:<\/path>)?/g;
  let pathMatch;
  while ((pathMatch = pathRegex.exec(processedSvgContent)) !== null) {
    const pathAttributes = pathMatch[1];
    
    // d 속성 추출
    const dMatch = pathAttributes.match(/d=['"]([^'"]*)['"]/);
    let pathData = dMatch ? dMatch[1] : '';
    
    // fill 속성 추출 (개별 path의 fill이 없으면 SVG 기본 fill 사용, 단 'none'이면 무시)
    const fillMatch = pathAttributes.match(/fill=['"]([^'"]*)['"]/);
    const fillColor = fillMatch ? fillMatch[1] : (svgDefaultFill === 'none' ? null : svgDefaultFill);
    
    // fill-rule 속성 추출
    const fillRuleMatch = pathAttributes.match(/fill-rule=['"]([^'"]*)['"]/);
    const fillRule = fillRuleMatch ? fillRuleMatch[1] : 'NonZero';
    
    // stroke 속성 추출
    const strokeMatch = pathAttributes.match(/stroke=['"]([^'"]*)['"]/);
    const strokeColor = strokeMatch ? strokeMatch[1] : null;
    
    // stroke-width 속성 추출
    const strokeWidthMatch = pathAttributes.match(/stroke-width=['"]([^'"]*)['"]/);
    const strokeWidth = strokeWidthMatch ? strokeWidthMatch[1] : '1';
    
    // 그라데이션 처리
    let fillBrush = null;
    let isGradientFill = false;
    
    if (fillColor && fillColor.startsWith('url(#')) {
      // 그라데이션 fill인 경우
      const gradientId = extractGradientId(fillColor);
      if (gradientId) {
        fillBrush = convertGradientToXaml(gradientId);
        isGradientFill = !!fillBrush;
      }
    }
    
    // 단색 fill 처리
    let convertedFillColor = null;
    if (!isGradientFill && fillColor && fillColor !== 'none') {
      convertedFillColor = convertColor(fillColor);
    }
    
    // fill과 stroke가 모두 없거나 모두 'none'이면 건너뛰기
    if ((fillColor === 'none' || !fillColor) && (strokeColor === 'none' || !strokeColor)) {
      continue;
    }
    
    // 보이지 않는 요소 필터링 (opacity, visibility, display 체크)
    const opacityMatch = pathAttributes.match(/opacity=['"]([^'"]*)['"]/);
    const visibilityMatch = pathAttributes.match(/visibility=['"]([^'"]*)['"]/);
    const displayMatch = pathAttributes.match(/display=['"]([^'"]*)['"]/);
    
    const opacity = opacityMatch ? parseFloat(opacityMatch[1]) : 1;
    const visibility = visibilityMatch ? visibilityMatch[1] : 'visible';
    const display = displayMatch ? displayMatch[1] : 'block';
    
    // 보이지 않는 요소는 건너뛰기
    if (opacity === 0 || visibility === 'hidden' || display === 'none') {
      continue;
    }
    
    // 공백 정리
    pathData = pathData.replace(/\s+/g, ' ').trim();
    
    // stroke와 fill 모두 처리
    if (strokeColor && strokeColor !== 'none' && fillColor && fillColor !== 'none') {
      // stroke와 fill 모두 있는 경우
      const convertedStrokeColor = convertColor(strokeColor);
      
      if (isGradientFill) {
        // 그라데이션 fill + stroke
        xaml += `<GeometryDrawing>
<GeometryDrawing.Brush>
${fillBrush}
</GeometryDrawing.Brush>
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<PathGeometry FillRule="${fillRule === 'evenodd' ? 'EvenOdd' : 'Nonzero'}" Figures="${pathData}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      } else {
        // 단색 fill + stroke
        xaml += `<GeometryDrawing Brush="${convertedFillColor}">
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<PathGeometry FillRule="${fillRule === 'evenodd' ? 'EvenOdd' : 'Nonzero'}" Figures="${pathData}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      }
    } else if (strokeColor && strokeColor !== 'none') {
      // stroke만 있는 경우
      const convertedStrokeColor = convertColor(strokeColor);
      xaml += `<GeometryDrawing>
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<PathGeometry FillRule="${fillRule === 'evenodd' ? 'EvenOdd' : 'Nonzero'}" Figures="${pathData}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
    } else if (fillColor && fillColor !== 'none') {
      // fill만 있는 경우
      if (isGradientFill) {
        // 그라데이션 fill만
        xaml += `<GeometryDrawing>
<GeometryDrawing.Brush>
${fillBrush}
</GeometryDrawing.Brush>
<GeometryDrawing.Geometry>
<PathGeometry FillRule="${fillRule === 'evenodd' ? 'EvenOdd' : 'Nonzero'}" Figures="${pathData}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      } else {
        // 단색 fill만
        xaml += `<GeometryDrawing Brush="${convertedFillColor}">
<GeometryDrawing.Geometry>
<PathGeometry FillRule="${fillRule === 'evenodd' ? 'EvenOdd' : 'Nonzero'}" Figures="${pathData}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      }
    }
  }
  
  // circle 요소 변환 (EllipseGeometry 사용)
  const circleRegex = /<circle([^>]*?)\/?>(?:<\/circle>)?/g;
  let circleMatch;
  while ((circleMatch = circleRegex.exec(processedSvgContent)) !== null) {
    const circleAttributes = circleMatch[1];
    
    const cxMatch = circleAttributes.match(/cx=['"]([^'"]*)['"]/);
    const cyMatch = circleAttributes.match(/cy=['"]([^'"]*)['"]/);
    const rMatch = circleAttributes.match(/r=['"]([^'"]*)['"]/);
    const fillMatch = circleAttributes.match(/fill=['"]([^'"]*)['"]/);
    const strokeMatch = circleAttributes.match(/stroke=['"]([^'"]*)['"]/);
    const strokeWidthMatch = circleAttributes.match(/stroke-width=['"]([^'"]*)['"]/);
    
    const cx = cxMatch ? cxMatch[1] : '0';
    const cy = cyMatch ? cyMatch[1] : '0';
    const r = rMatch ? rMatch[1] : '5';
    const fillColor = fillMatch ? fillMatch[1] : (svgDefaultFill === 'none' ? null : svgDefaultFill);
    const strokeColor = strokeMatch ? strokeMatch[1] : null;
    const strokeWidth = strokeWidthMatch ? strokeWidthMatch[1] : '1';
    
    // 그라데이션 처리
    let fillBrush = null;
    let isGradientFill = false;
    
    if (fillColor && fillColor.startsWith('url(#')) {
      const gradientId = extractGradientId(fillColor);
      if (gradientId) {
        fillBrush = convertGradientToXaml(gradientId);
        isGradientFill = !!fillBrush;
      }
    }
    
    let convertedFillColor = null;
    if (!isGradientFill && fillColor && fillColor !== 'none') {
      convertedFillColor = convertColor(fillColor);
    }
    
    // fill과 stroke가 모두 없거나 모두 'none'이면 건너뛰기
    if ((fillColor === 'none' || !fillColor) && (strokeColor === 'none' || !strokeColor)) {
      continue;
    }
    
    // stroke와 fill 모두 처리
    if (strokeColor && strokeColor !== 'none' && fillColor && fillColor !== 'none') {
      const convertedStrokeColor = convertColor(strokeColor);
      
      if (isGradientFill) {
        xaml += `<GeometryDrawing>
<GeometryDrawing.Brush>
${fillBrush}
</GeometryDrawing.Brush>
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<EllipseGeometry Center="${cx},${cy}" RadiusX="${r}" RadiusY="${r}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      } else {
        xaml += `<GeometryDrawing Brush="${convertedFillColor}">
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<EllipseGeometry Center="${cx},${cy}" RadiusX="${r}" RadiusY="${r}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      }
    } else if (strokeColor && strokeColor !== 'none') {
      const convertedStrokeColor = convertColor(strokeColor);
      xaml += `<GeometryDrawing>
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<EllipseGeometry Center="${cx},${cy}" RadiusX="${r}" RadiusY="${r}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
    } else if (fillColor && fillColor !== 'none') {
      if (isGradientFill) {
        xaml += `<GeometryDrawing>
<GeometryDrawing.Brush>
${fillBrush}
</GeometryDrawing.Brush>
<GeometryDrawing.Geometry>
<EllipseGeometry Center="${cx},${cy}" RadiusX="${r}" RadiusY="${r}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      } else {
        xaml += `<GeometryDrawing Brush="${convertedFillColor}">
<GeometryDrawing.Geometry>
<EllipseGeometry Center="${cx},${cy}" RadiusX="${r}" RadiusY="${r}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      }
    }
  }
  
  // rect 요소 변환 (RectangleGeometry 사용)
  const rectRegex = /<rect([^>]*?)\/?>(?:<\/rect>)?/g;
  let rectMatch;
  while ((rectMatch = rectRegex.exec(processedSvgContent)) !== null) {
    const rectAttributes = rectMatch[1];
    
    const xMatch = rectAttributes.match(/x=['"]([^'"]*)['"]/);
    const yMatch = rectAttributes.match(/y=['"]([^'"]*)['"]/);
    const widthMatch = rectAttributes.match(/width=['"]([^'"]*)['"]/);
    const heightMatch = rectAttributes.match(/height=['"]([^'"]*)['"]/);
    const fillMatch = rectAttributes.match(/fill=['"]([^'"]*)['"]/);
    const strokeMatch = rectAttributes.match(/stroke=['"]([^'"]*)['"]/);
    const strokeWidthMatch = rectAttributes.match(/stroke-width=['"]([^'"]*)['"]/);
    
    const x = xMatch ? xMatch[1] : '0';
    const y = yMatch ? yMatch[1] : '0';
    const width = widthMatch ? widthMatch[1] : '0';
    const height = heightMatch ? heightMatch[1] : '0';
    const fillColor = fillMatch ? fillMatch[1] : (svgDefaultFill === 'none' ? null : svgDefaultFill);
    const strokeColor = strokeMatch ? strokeMatch[1] : null;
    const strokeWidth = strokeWidthMatch ? strokeWidthMatch[1] : '1';
    
    // 크기가 0이면 건너뛰기
    if (parseFloat(width) <= 0 || parseFloat(height) <= 0) {
      continue;
    }
    
    // 그라데이션 처리
    let fillBrush = null;
    let isGradientFill = false;
    
    if (fillColor && fillColor.startsWith('url(#')) {
      const gradientId = extractGradientId(fillColor);
      if (gradientId) {
        fillBrush = convertGradientToXaml(gradientId);
        isGradientFill = !!fillBrush;
      }
    }
    
    let convertedFillColor = null;
    if (!isGradientFill && fillColor && fillColor !== 'none') {
      convertedFillColor = convertColor(fillColor);
    }
    
    // fill과 stroke가 모두 없거나 모두 'none'이면 건너뛰기
    if ((fillColor === 'none' || !fillColor) && (strokeColor === 'none' || !strokeColor)) {
      continue;
    }
    
    // 보이지 않는 요소 필터링 (opacity, visibility, display 체크)
    const opacityMatch = rectAttributes.match(/opacity=['"]([^'"]*)['"]/);
    const visibilityMatch = rectAttributes.match(/visibility=['"]([^'"]*)['"]/);
    const displayMatch = rectAttributes.match(/display=['"]([^'"]*)['"]/);
    
    const opacity = opacityMatch ? parseFloat(opacityMatch[1]) : 1;
    const visibility = visibilityMatch ? visibilityMatch[1] : 'visible';
    const display = displayMatch ? displayMatch[1] : 'block';
    
    // 보이지 않는 요소는 건너뛰기
    if (opacity === 0 || visibility === 'hidden' || display === 'none') {
      continue;
    }
    
    // stroke와 fill 모두 처리
    if (strokeColor && strokeColor !== 'none' && fillColor && fillColor !== 'none') {
      const convertedStrokeColor = convertColor(strokeColor);
      
      if (isGradientFill) {
        xaml += `<GeometryDrawing>
<GeometryDrawing.Brush>
${fillBrush}
</GeometryDrawing.Brush>
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<RectangleGeometry Rect="${x},${y},${width},${height}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      } else {
        xaml += `<GeometryDrawing Brush="${convertedFillColor}">
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<RectangleGeometry Rect="${x},${y},${width},${height}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      }
    } else if (strokeColor && strokeColor !== 'none') {
      const convertedStrokeColor = convertColor(strokeColor);
      xaml += `<GeometryDrawing>
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<RectangleGeometry Rect="${x},${y},${width},${height}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
    } else if (fillColor && fillColor !== 'none') {
      if (isGradientFill) {
        xaml += `<GeometryDrawing>
<GeometryDrawing.Brush>
${fillBrush}
</GeometryDrawing.Brush>
<GeometryDrawing.Geometry>
<RectangleGeometry Rect="${x},${y},${width},${height}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      } else {
        xaml += `<GeometryDrawing Brush="${convertedFillColor}">
<GeometryDrawing.Geometry>
<RectangleGeometry Rect="${x},${y},${width},${height}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      }
    }
  }
  
  // ellipse 요소 변환 (EllipseGeometry 사용)
  const ellipseRegex = /<ellipse([^>]*?)\/?>(?:<\/ellipse>)?/g;
  let ellipseMatch;
  while ((ellipseMatch = ellipseRegex.exec(processedSvgContent)) !== null) {
    const ellipseAttributes = ellipseMatch[1];
    
    const cxMatch = ellipseAttributes.match(/cx=['"]([^'"]*)['"]/);
    const cyMatch = ellipseAttributes.match(/cy=['"]([^'"]*)['"]/);
    const rxMatch = ellipseAttributes.match(/rx=['"]([^'"]*)['"]/);
    const ryMatch = ellipseAttributes.match(/ry=['"]([^'"]*)['"]/);
    const fillMatch = ellipseAttributes.match(/fill=['"]([^'"]*)['"]/);
    const strokeMatch = ellipseAttributes.match(/stroke=['"]([^'"]*)['"]/);
    const strokeWidthMatch = ellipseAttributes.match(/stroke-width=['"]([^'"]*)['"]/);
    
    const cx = cxMatch ? cxMatch[1] : '0';
    const cy = cyMatch ? cyMatch[1] : '0';
    const rx = rxMatch ? rxMatch[1] : '5';
    const ry = ryMatch ? ryMatch[1] : '5';
    const fillColor = fillMatch ? fillMatch[1] : (svgDefaultFill === 'none' ? null : svgDefaultFill);
    const strokeColor = strokeMatch ? strokeMatch[1] : null;
    const strokeWidth = strokeWidthMatch ? strokeWidthMatch[1] : '1';
    
    // 크기가 0이면 건너뛰기
    if (parseFloat(rx) <= 0 || parseFloat(ry) <= 0) {
      continue;
    }
    
    // 그라데이션 처리
    let fillBrush = null;
    let isGradientFill = false;
    
    if (fillColor && fillColor.startsWith('url(#')) {
      const gradientId = extractGradientId(fillColor);
      if (gradientId) {
        fillBrush = convertGradientToXaml(gradientId);
        isGradientFill = !!fillBrush;
      }
    }
    
    let convertedFillColor = null;
    if (!isGradientFill && fillColor && fillColor !== 'none') {
      convertedFillColor = convertColor(fillColor);
    }
    
    // fill과 stroke가 모두 없거나 모두 'none'이면 건너뛰기
    if ((fillColor === 'none' || !fillColor) && (strokeColor === 'none' || !strokeColor)) {
      continue;
    }
    
    // stroke와 fill 모두 처리
    if (strokeColor && strokeColor !== 'none' && fillColor && fillColor !== 'none') {
      const convertedStrokeColor = convertColor(strokeColor);
      
      if (isGradientFill) {
        xaml += `<GeometryDrawing>
<GeometryDrawing.Brush>
${fillBrush}
</GeometryDrawing.Brush>
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<EllipseGeometry Center="${cx},${cy}" RadiusX="${rx}" RadiusY="${ry}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      } else {
        xaml += `<GeometryDrawing Brush="${convertedFillColor}">
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<EllipseGeometry Center="${cx},${cy}" RadiusX="${rx}" RadiusY="${ry}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      }
    } else if (strokeColor && strokeColor !== 'none') {
      const convertedStrokeColor = convertColor(strokeColor);
      xaml += `<GeometryDrawing>
<GeometryDrawing.Pen>
<Pen Brush="${convertedStrokeColor}" Thickness="${strokeWidth}" StartLineCap="Flat" EndLineCap="Flat" LineJoin="Miter" />
</GeometryDrawing.Pen>
<GeometryDrawing.Geometry>
<EllipseGeometry Center="${cx},${cy}" RadiusX="${rx}" RadiusY="${ry}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
    } else if (fillColor && fillColor !== 'none') {
      if (isGradientFill) {
        xaml += `<GeometryDrawing>
<GeometryDrawing.Brush>
${fillBrush}
</GeometryDrawing.Brush>
<GeometryDrawing.Geometry>
<EllipseGeometry Center="${cx},${cy}" RadiusX="${rx}" RadiusY="${ry}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      } else {
        xaml += `<GeometryDrawing Brush="${convertedFillColor}">
<GeometryDrawing.Geometry>
<EllipseGeometry Center="${cx},${cy}" RadiusX="${rx}" RadiusY="${ry}" />
</GeometryDrawing.Geometry>
</GeometryDrawing>
`;
      }
    }
  }
  
  return xaml;
}





// 색상 변환 함수 (SVG 색상을 WPF 색상으로 변환)
function convertColor(color) {
  if (!color || color === 'none') {
    return 'Transparent';
  }
  
  // 이미 #FF 형식인 경우
  if (color.startsWith('#') && color.length === 9) {
    return color;
  }
  
  // #000000 형식을 #FF000000으로 변환
  if (color.startsWith('#') && color.length === 7) {
    return '#FF' + color.substring(1);
  }
  
  // #000 형식을 #FF000000으로 변환
  if (color.startsWith('#') && color.length === 4) {
    const r = color[1];
    const g = color[2];
    const b = color[3];
    return `#FF${r}${r}${g}${g}${b}${b}`;
  }
  
  // 색상명 변환
  const colorMap = {
    'black': '#FF000000',
    'white': '#FFFFFFFF',
    'red': '#FFFF0000',
    'green': '#FF00FF00',
    'blue': '#FF0000FF',
    'yellow': '#FFFFFF00',
    'cyan': '#FF00FFFF',
    'magenta': '#FFFF00FF'
  };
  
  return colorMap[color.toLowerCase()] || '#FF000000';
}

// 그라데이션 정보를 저장하는 객체
let gradientDefinitions = {};

// SVG defs에서 그라데이션 정의 추출
function extractGradientDefinitions(svgContent) {
  gradientDefinitions = {};
  
  // linearGradient 추출
  const linearGradientRegex = /<linearGradient([^>]*?)>(.*?)<\/linearGradient>/gs;
  let match;
  while ((match = linearGradientRegex.exec(svgContent)) !== null) {
    const attributes = match[1];
    const content = match[2];
    
    // id 추출
    const idMatch = attributes.match(/id=['"]([^'"]*)['"]/);
    if (idMatch) {
      const id = idMatch[1];
      gradientDefinitions[id] = parseLinearGradient(attributes, content);
    }
  }
  
  // radialGradient 추출
  const radialGradientRegex = /<radialGradient([^>]*?)>(.*?)<\/radialGradient>/gs;
  while ((match = radialGradientRegex.exec(svgContent)) !== null) {
    const attributes = match[1];
    const content = match[2];
    
    // id 추출
    const idMatch = attributes.match(/id=['"]([^'"]*)['"]/);
    if (idMatch) {
      const id = idMatch[1];
      gradientDefinitions[id] = parseRadialGradient(attributes, content);
    }
  }
}

// LinearGradient 파싱
function parseLinearGradient(attributes, content) {
  const gradient = {
    type: 'linear',
    x1: '0%',
    y1: '0%',
    x2: '100%',
    y2: '0%',
    stops: []
  };
  
  // 좌표 추출
  const x1Match = attributes.match(/x1=['"]([^'"]*)['"]/);
  const y1Match = attributes.match(/y1=['"]([^'"]*)['"]/);
  const x2Match = attributes.match(/x2=['"]([^'"]*)['"]/);
  const y2Match = attributes.match(/y2=['"]([^'"]*)['"]/);
  
  if (x1Match) gradient.x1 = x1Match[1];
  if (y1Match) gradient.y1 = y1Match[1];
  if (x2Match) gradient.x2 = x2Match[1];
  if (y2Match) gradient.y2 = y2Match[1];
  
  // stop 요소들 추출
  const stopRegex = /<stop([^>]*?)\/?>(?:<\/stop>)?/g;
  let stopMatch;
  while ((stopMatch = stopRegex.exec(content)) !== null) {
    const stopAttributes = stopMatch[1];
    
    const offsetMatch = stopAttributes.match(/offset=['"]([^'"]*)['"]/);
    const stopColorMatch = stopAttributes.match(/stop-color=['"]([^'"]*)['"]/);
    const stopOpacityMatch = stopAttributes.match(/stop-opacity=['"]([^'"]*)['"]/);
    
    const stop = {
      offset: offsetMatch ? offsetMatch[1] : '0',
      color: stopColorMatch ? stopColorMatch[1] : '#000000',
      opacity: stopOpacityMatch ? parseFloat(stopOpacityMatch[1]) : 1
    };
    
    gradient.stops.push(stop);
  }
  
  return gradient;
}

// RadialGradient 파싱
function parseRadialGradient(attributes, content) {
  const gradient = {
    type: 'radial',
    cx: '50%',
    cy: '50%',
    r: '50%',
    stops: []
  };
  
  // 좌표 추출
  const cxMatch = attributes.match(/cx=['"]([^'"]*)['"]/);
  const cyMatch = attributes.match(/cy=['"]([^'"]*)['"]/);
  const rMatch = attributes.match(/r=['"]([^'"]*)['"]/);
  
  if (cxMatch) gradient.cx = cxMatch[1];
  if (cyMatch) gradient.cy = cyMatch[1];
  if (rMatch) gradient.r = rMatch[1];
  
  // stop 요소들 추출 (linearGradient와 동일)
  const stopRegex = /<stop([^>]*?)\/?>(?:<\/stop>)?/g;
  let stopMatch;
  while ((stopMatch = stopRegex.exec(content)) !== null) {
    const stopAttributes = stopMatch[1];
    
    const offsetMatch = stopAttributes.match(/offset=['"]([^'"]*)['"]/);
    const stopColorMatch = stopAttributes.match(/stop-color=['"]([^'"]*)['"]/);
    const stopOpacityMatch = stopAttributes.match(/stop-opacity=['"]([^'"]*)['"]/);
    
    const stop = {
      offset: offsetMatch ? offsetMatch[1] : '0',
      color: stopColorMatch ? stopColorMatch[1] : '#000000',
      opacity: stopOpacityMatch ? parseFloat(stopOpacityMatch[1]) : 1
    };
    
    gradient.stops.push(stop);
  }
  
  return gradient;
}

// url(#gradientId) 형식에서 그라데이션 ID 추출
function extractGradientId(fillValue) {
  const urlMatch = fillValue.match(/url\(#([^)]+)\)/);
  return urlMatch ? urlMatch[1] : null;
}

// SVG 그라데이션을 XAML 그라데이션으로 변환
function convertGradientToXaml(gradientId) {
  const gradient = gradientDefinitions[gradientId];
  if (!gradient) {
    return null;
  }
  
  if (gradient.type === 'linear') {
    return convertLinearGradientToXaml(gradient);
  } else if (gradient.type === 'radial') {
    return convertRadialGradientToXaml(gradient);
  }
  
  return null;
}

// Linear Gradient를 XAML로 변환
function convertLinearGradientToXaml(gradient) {
  // 좌표를 XAML 형식으로 변환
  const startPoint = convertGradientCoordinate(gradient.x1, gradient.y1);
  const endPoint = convertGradientCoordinate(gradient.x2, gradient.y2);
  
  let xaml = `<LinearGradientBrush StartPoint="${startPoint}" EndPoint="${endPoint}">`;
  
  // GradientStops 추가
  if (gradient.stops.length > 0) {
    xaml += '\n<LinearGradientBrush.GradientStops>';
    
    gradient.stops.forEach(stop => {
      const offset = convertOffset(stop.offset);
      let color = convertColor(stop.color);
      
      // opacity 적용
      if (stop.opacity < 1 && color.startsWith('#FF')) {
        const alpha = Math.round(stop.opacity * 255).toString(16).padStart(2, '0').toUpperCase();
        color = '#' + alpha + color.substring(3);
      }
      
      xaml += `\n<GradientStop Color="${color}" Offset="${offset}" />`;
    });
    
    xaml += '\n</LinearGradientBrush.GradientStops>';
  }
  
  xaml += '\n</LinearGradientBrush>';
  return xaml;
}

// Radial Gradient를 XAML로 변환
function convertRadialGradientToXaml(gradient) {
  // 중심점과 반지름 변환
  const center = convertGradientCoordinate(gradient.cx, gradient.cy);
  const radiusX = convertPercentage(gradient.r);
  const radiusY = radiusX; // SVG radial gradient는 원형, XAML은 타원형이지만 같은 값 사용
  
  let xaml = `<RadialGradientBrush Center="${center}" RadiusX="${radiusX}" RadiusY="${radiusY}">`;
  
  // GradientStops 추가
  if (gradient.stops.length > 0) {
    xaml += '\n<RadialGradientBrush.GradientStops>';
    
    gradient.stops.forEach(stop => {
      const offset = convertOffset(stop.offset);
      let color = convertColor(stop.color);
      
      // opacity 적용
      if (stop.opacity < 1 && color.startsWith('#FF')) {
        const alpha = Math.round(stop.opacity * 255).toString(16).padStart(2, '0').toUpperCase();
        color = '#' + alpha + color.substring(3);
      }
      
      xaml += `\n<GradientStop Color="${color}" Offset="${offset}" />`;
    });
    
    xaml += '\n</RadialGradientBrush.GradientStops>';
  }
  
  xaml += '\n</RadialGradientBrush>';
  return xaml;
}

// 그라데이션 좌표 변환 (% 또는 숫자를 0-1 사이 값으로)
function convertGradientCoordinate(x, y) {
  const convertValue = (val) => {
    if (typeof val === 'string' && val.includes('%')) {
      return (parseFloat(val) / 100).toString();
    }
    return parseFloat(val).toString();
  };
  
  return `${convertValue(x)},${convertValue(y)}`;
}

// 퍼센트 값을 0-1 사이로 변환
function convertPercentage(value) {
  if (typeof value === 'string' && value.includes('%')) {
    return (parseFloat(value) / 100).toString();
  }
  return parseFloat(value).toString();
}

// offset 값을 0-1 사이로 변환
function convertOffset(offset) {
  if (typeof offset === 'string' && offset.includes('%')) {
    return (parseFloat(offset) / 100).toString();
  }
  return parseFloat(offset).toString();
}

// 선택 상태만 확인하는 함수 (변환은 하지 않음)
async function checkSelection() {
  try {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      if (isUIOpen) {
        figma.ui.postMessage({
          type: 'no-selection'
        });
      }
      return;
    }
    
    if (selection.length > 1) {
      if (isUIOpen) {
        figma.ui.postMessage({
          type: 'multiple-selection'
        });
      }
      return;
    }
    
    const selectedNode = selection[0];
    
    // 선택된 요소가 있으면 준비 상태만 전송 (변환 안 함)
    if (isUIOpen) {
      figma.ui.postMessage({
        type: 'selection-ready',
        nodeName: selectedNode.name
      });
    }
    
  } catch (error) {
    console.error('선택 확인 오류:', error);
    if (isUIOpen) {
      figma.ui.postMessage({
        type: 'error',
        message: '선택 확인 중 오류가 발생했습니다: ' + error.message
      });
    }
  }
}

// 실제 변환을 수행하는 함수 (UI에서 요청할 때만 실행)
async function convertSelectedSVG(customKeyName = null) {
  try {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      if (isUIOpen) {
        figma.ui.postMessage({
          type: 'error',
          message: '선택된 요소가 없습니다.'
        });
      }
      return;
    }
    
    if (selection.length > 1) {
      if (isUIOpen) {
        figma.ui.postMessage({
          type: 'error',
          message: '하나의 요소만 선택해주세요.'
        });
      }
      return;
    }
    
    const selectedNode = selection[0];
    
    // SVG로 내보내기
    let svgString = await selectedNode.exportAsync({
      format: 'SVG_STRING'
    });
    
    console.log('원본 SVG:', svgString);
    
    // SVG 문자열 포맷팅 (가독성을 위해)
    const formattedSvg = formatSvg(svgString);
    console.log('포맷된 SVG:', formattedSvg);
    
    // 변환을 위해서는 압축된 버전 사용
    const compressedSvg = svgString
      .trim()
      .replace(/\r?\n/g, '')
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .replace(/\s+>/g, '>')
      .replace(/\s+\/>/g, '/>');
    
    // XAML로 변환
    let xamlString = convertSvgToXaml(compressedSvg);
    
    // 사용자 지정 Key 이름 또는 기본 이름 사용
    let keyName = customKeyName;
    if (!keyName) {
      keyName = selectedNode.name.replace(/[^a-zA-Z0-9]/g, '') || 'Icon';
    }
    
    // Key 이름 중복 방지 옵션
    let finalKeyName = keyName;
    if (!customKeyName) {
      // 사용자가 직접 지정하지 않은 경우에만 타임스탬프 추가
      const timestamp = Date.now().toString().slice(-6);
      finalKeyName = keyName + '_' + timestamp;
    }
    
    xamlString = xamlString.replace('{{NODE_NAME}}', finalKeyName);
    
    console.log('XAML 결과:', xamlString);
    console.log('사용된 Key 이름:', finalKeyName);
    
    // UI로 변환 완료 데이터 전송
    if (isUIOpen) {
      figma.ui.postMessage({
        type: 'conversion-completed',
        xamlString: xamlString,
        originalSvg: formattedSvg,
        nodeName: selectedNode.name,
        keyName: finalKeyName
      });
    }
    
  } catch (error) {
    console.error('XAML 변환 오류:', error);
    if (isUIOpen) {
      figma.ui.postMessage({
        type: 'error',
        message: 'XAML 변환 중 오류가 발생했습니다: ' + error.message
      });
    }
  }
}

async function main() {
  // UI 표시
  figma.showUI(__html__, { 
    width: 400, 
    height: 640,
    themeColors: true 
  });
  
  isUIOpen = true;
  
  // 초기 선택 확인 (변환 안 함)
  await checkSelection();
  
  // 선택 변경 이벤트 리스너 추가 (변환 안 함)
  figma.on('selectionchange', async () => {
    await checkSelection();
  });
}

// UI에서 메시지 받기
figma.ui.onmessage = (msg) => {
  if (msg.type === 'close-plugin') {
    isUIOpen = false;
    figma.closePlugin();
  } else if (msg.type === 'convert-request') {
    // UI에서 변환 요청이 올 때만 실제 변환 수행
    const keyName = msg.keyName;
    convertSelectedSVG(keyName);
  }
};

main();