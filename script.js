(() => {
  const canvas = document.getElementById('space-canvas');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('planet-wrap');
  const sensitivity = document.getElementById('sensitivity');
  const sensitivityValue = document.getElementById('sensitivity-value');
  const impactCount = document.getElementById('impact-count');
  const planetCondition = document.getElementById('planet-condition');
  const populationCount = document.getElementById('population-count');
  const landRemains = document.getElementById('land-remains');
  const stageMessage = document.getElementById('stage-message');
  const resetButton = document.getElementById('reset-button');
  const startingPopulation = 8200000000;

  const landmasses = [
    [[-168, 70], [-145, 69], [-132, 57], [-124, 49], [-128, 40], [-117, 32], [-105, 25], [-97, 19], [-88, 16], [-82, 23], [-80, 31], [-73, 42], [-61, 49], [-67, 57], [-81, 61], [-97, 72], [-122, 74], [-145, 72]],
    [[-81, 12], [-70, 9], [-58, 4], [-48, -1], [-42, -10], [-47, -22], [-54, -34], [-66, -55], [-73, -47], [-77, -29], [-80, -13]],
    [[-11, 72], [9, 70], [26, 61], [43, 58], [58, 50], [77, 54], [91, 61], [113, 56], [130, 50], [145, 55], [163, 60], [178, 52], [167, 42], [147, 38], [133, 31], [121, 22], [109, 12], [103, 2], [113, -5], [127, -4], [135, -8], [129, -17], [115, -22], [105, -17], [95, -7], [83, 7], [70, 18], [57, 25], [47, 33], [37, 39], [27, 35], [17, 38], [10, 45], [-2, 48], [-9, 57]],
    [[-18, 35], [-4, 37], [12, 33], [28, 30], [37, 18], [43, 4], [50, -12], [41, -25], [31, -34], [17, -35], [8, -29], [-1, -17], [-8, -2], [-15, 13]],
    [[-9, 59], [2, 58], [1, 51], [-5, 50]],
    [[112, -11], [129, -10], [144, -15], [153, -27], [146, -39], [132, -44], [117, -35], [113, -23]],
    [[47, -13], [50, -16], [49, -25], [45, -24]],
    [[-180, -72], [-140, -76], [-90, -73], [-40, -78], [10, -73], [60, -77], [110, -71], [160, -75], [180, -70], [180, -90], [-180, -90]]
  ];

  const state = {
    rotation: -0.55,
    tilt: -0.12,
    sensitivity: 1,
    weapon: 'bomb',
    impacts: [],
    stars: [],
    width: 0,
    height: 0,
    baseRadius: 0,
    radius: 0,
    zoom: 1,
    dpr: 1,
    pointer: null,
    dragMoved: false,
    lastFrame: 0,
    flash: null,
    hits: 0
  };

  const landCells = [];
  let totalLandArea = 0;
  let destroyedLandArea = 0;

  function isInsidePolygon(longitude, latitude, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const [currentLongitude, currentLatitude] = polygon[i];
      const [previousLongitude, previousLatitude] = polygon[j];
      const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude);
      if (crossesLatitude
        && longitude < (previousLongitude - currentLongitude) * (latitude - currentLatitude)
          / (previousLatitude - currentLatitude) + currentLongitude) {
        inside = !inside;
      }
    }
    return inside;
  }

  function buildLandGrid() {
    const polygons = landmasses.map(points => ({
      points,
      minLongitude: Math.min(...points.map(point => point[0])),
      maxLongitude: Math.max(...points.map(point => point[0])),
      minLatitude: Math.min(...points.map(point => point[1])),
      maxLatitude: Math.max(...points.map(point => point[1]))
    }));

    for (let latitudeDegrees = -89.5; latitudeDegrees < 90; latitudeDegrees += 1) {
      const latitude = latitudeDegrees * Math.PI / 180;
      const weight = Math.cos(latitude);
      const y = Math.sin(latitude);
      const latitudeBounds = latitudeDegrees;
      for (let longitudeDegrees = -179.5; longitudeDegrees < 180; longitudeDegrees += 1) {
        let isLand = false;
        for (const polygon of polygons) {
          if (longitudeDegrees < polygon.minLongitude || longitudeDegrees > polygon.maxLongitude
            || latitudeBounds < polygon.minLatitude || latitudeBounds > polygon.maxLatitude) continue;
          if (isInsidePolygon(longitudeDegrees, latitudeBounds, polygon.points)) {
            isLand = true;
            break;
          }
        }
        if (!isLand) continue;
        const longitude = longitudeDegrees * Math.PI / 180;
        landCells.push({
          x: Math.cos(latitude) * Math.sin(longitude),
          y,
          z: Math.cos(latitude) * Math.cos(longitude),
          weight,
          destroyed: false
        });
        totalLandArea += weight;
      }
    }
  }

  function updatePopulation() {
    const remainingLandRatio = totalLandArea > 0
      ? Math.max(0, 1 - destroyedLandArea / totalLandArea)
      : 1;
    const population = Math.floor(startingPopulation * remainingLandRatio);
    populationCount.textContent = population >= 100000000
      ? `${(population / 100000000).toFixed(2)}억 명`
      : `${population.toLocaleString('ko-KR')}명`;
    landRemains.textContent = `육지 ${(remainingLandRatio * 100).toFixed(2)}% 유지`;
  }

  function destroyLandUnder(impact) {
    const latitude = impact.lat;
    const longitude = impact.lon;
    const centerX = Math.cos(latitude) * Math.sin(longitude);
    const centerY = Math.sin(latitude);
    const centerZ = Math.cos(latitude) * Math.cos(longitude);
    const minimumDot = Math.cos(Math.asin(Math.min(1, impact.radiusRatio)));

    for (const cell of landCells) {
      if (cell.destroyed) continue;
      if (cell.x * centerX + cell.y * centerY + cell.z * centerZ >= minimumDot) {
        cell.destroyed = true;
        destroyedLandArea += cell.weight;
      }
    }
    updatePopulation();
  }

  function resize() {
    const rect = wrap.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = rect.width;
    state.height = rect.height;
    state.baseRadius = Math.min(rect.width * (rect.width < 760 ? 0.39 : 0.235), rect.height * 0.405, 260);
    state.radius = state.baseRadius * state.zoom;
    canvas.width = Math.max(1, Math.round(rect.width * state.dpr));
    canvas.height = Math.max(1, Math.round(rect.height * state.dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    makeStars();
  }

  function makeStars() {
    const count = Math.max(45, Math.round(state.width * state.height / 5000));
    state.stars = Array.from({ length: count }, () => ({
      x: Math.random() * state.width,
      y: Math.random() * state.height,
      r: Math.random() * 1.1 + 0.25,
      alpha: Math.random() * 0.5 + 0.15,
      phase: Math.random() * Math.PI * 2
    }));
  }

  function rotatePoint(lon, lat) {
    const longitude = lon + state.rotation;
    const latitude = lat;
    const x = Math.cos(latitude) * Math.sin(longitude);
    const y = Math.sin(latitude);
    const z = Math.cos(latitude) * Math.cos(longitude);
    const tiltedY = y * Math.cos(state.tilt) - z * Math.sin(state.tilt);
    const depth = y * Math.sin(state.tilt) + z * Math.cos(state.tilt);
    return { x, y: tiltedY, depth };
  }

  function projectVector(vector, cx, cy) {
    return {
      x: cx + vector.x * state.radius,
      y: cy - vector.y * state.radius,
      depth: vector.depth
    };
  }

  function drawStars(time) {
    for (const star of state.stars) {
      const pulse = 0.75 + Math.sin(time / 1000 + star.phase) * 0.25;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(185, 210, 255, ${star.alpha * pulse})`;
      ctx.fill();
    }
  }

  function drawGrid(cx, cy) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, state.radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(122, 195, 234, .13)';
    ctx.lineWidth = 0.7;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += 4) {
        const point = projectVector(rotatePoint(lon * Math.PI / 180, lat * Math.PI / 180), cx, cy);
        if (point.depth > 0) {
          if (lon === -180) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        } else {
          ctx.moveTo(point.x, point.y);
        }
      }
      ctx.stroke();
    }
    for (let lon = -150; lon < 180; lon += 30) {
      ctx.beginPath();
      let drawing = false;
      for (let lat = -88; lat <= 88; lat += 3) {
        const point = projectVector(rotatePoint(lon * Math.PI / 180, lat * Math.PI / 180), cx, cy);
        if (point.depth > 0) {
          if (!drawing) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
          drawing = true;
        } else drawing = false;
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLand(cx, cy) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, state.radius, 0, Math.PI * 2);
    ctx.clip();
    for (const shape of landmasses) {
      let penDown = false;
      ctx.beginPath();
      for (const [longitude, latitude] of shape) {
        const point = projectVector(rotatePoint(longitude * Math.PI / 180, latitude * Math.PI / 180), cx, cy);
        if (point.depth > -0.04) {
          if (!penDown) {
            ctx.moveTo(point.x, point.y);
            penDown = true;
          } else ctx.lineTo(point.x, point.y);
        } else {
          penDown = false;
        }
      }
      ctx.closePath();
      const land = ctx.createLinearGradient(cx - state.radius, cy - state.radius, cx + state.radius, cy + state.radius);
      land.addColorStop(0, '#72b966');
      land.addColorStop(0.52, '#4d9d65');
      land.addColorStop(1, '#286e64');
      ctx.fillStyle = land;
      ctx.fill();
      ctx.strokeStyle = 'rgba(181, 232, 153, .38)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawImpact(impact, cx, cy) {
    const point = projectVector(rotatePoint(impact.lon, impact.lat), cx, cy);
    if (point.depth <= 0) return;
    const scale = impact.radiusRatio * state.radius;
    const x = point.x;
    const y = point.y;
    const depth = Math.min(impact.depth, 6);
    ctx.save();
    const longitude = impact.lon + state.rotation;
    const latitude = impact.lat;
    const eastX = Math.cos(longitude);
    const eastY = -Math.sin(longitude) * Math.sin(state.tilt);
    const northX = -Math.sin(latitude) * Math.sin(longitude);
    const northY = -Math.sin(latitude) * Math.cos(longitude) * Math.sin(state.tilt) - Math.cos(latitude) * Math.cos(state.tilt);
    const axisX = eastX * eastX + northX * northX;
    const axisY = eastY * eastY + northY * northY;
    const axisXY = eastX * eastY + northX * northY;
    const axisAngle = 0.5 * Math.atan2(2 * axisXY, axisX - axisY);
    const axisRoot = Math.sqrt((axisX - axisY) ** 2 + 4 * axisXY ** 2);
    const major = Math.max(0.08, scale * Math.sqrt((axisX + axisY + axisRoot) / 2));
    const minor = Math.max(0.08, scale * Math.sqrt((axisX + axisY - axisRoot) / 2));
    const coreRadius = impact.weapon === 'laser'
      ? 0.12 + depth * 0.13
      : 0.38 + depth * 0.09;

    ctx.translate(x, y);
    ctx.rotate(axisAngle);
    ctx.scale(major, minor);

    ctx.shadowColor = 'rgba(255, 49, 18, .72)';
    ctx.shadowBlur = 0.2 + depth * 0.035;
    const cavity = ctx.createRadialGradient(-0.12, -0.17, 0.03, 0.02, 0.04, 1.03);
    cavity.addColorStop(0, '#080910');
    cavity.addColorStop(0.48, '#151019');
    cavity.addColorStop(0.78, '#48201d');
    cavity.addColorStop(0.92, '#e34b25');
    cavity.addColorStop(1, '#30121a');
    ctx.fillStyle = cavity;
    ctx.beginPath();
    ctx.ellipse(0, 0, 1, 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(255, 167, 91, .9)';
    ctx.lineWidth = 0.075;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.96, 0.96, 0, 0, Math.PI * 2);
    ctx.stroke();

    const core = ctx.createRadialGradient(-0.12, -0.18, 0.015, 0.04, 0.06, coreRadius);
    core.addColorStop(0, depth >= 3 ? '#ffb34e' : '#c41226');
    core.addColorStop(0.28, '#ed301e');
    core.addColorStop(0.65, '#a91024');
    core.addColorStop(1, 'rgba(83, 12, 27, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(0, 0, coreRadius, coreRadius, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 101, 43, .76)';
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.ellipse(0, 0, coreRadius * 1.04, coreRadius * 1.04, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlanet(cx, cy, time) {
    const r = state.radius;
    const atmosphere = ctx.createRadialGradient(cx - r * .26, cy - r * .32, r * .45, cx, cy, r * 1.13);
    atmosphere.addColorStop(0, 'rgba(66, 154, 246, 0)');
    atmosphere.addColorStop(.82, 'rgba(66, 154, 246, .04)');
    atmosphere.addColorStop(.94, 'rgba(91, 187, 255, .42)');
    atmosphere.addColorStop(1, 'rgba(46, 118, 237, 0)');
    ctx.fillStyle = atmosphere;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.13, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const ocean = ctx.createRadialGradient(cx - r * .36, cy - r * .4, r * .08, cx + r * .13, cy + r * .12, r * 1.22);
    ocean.addColorStop(0, '#3185bc');
    ocean.addColorStop(.52, '#17629b');
    ocean.addColorStop(1, '#082443');
    ctx.fillStyle = ocean;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    drawGrid(cx, cy);
    drawLand(cx, cy);

    const shade = ctx.createLinearGradient(cx - r * .6, cy - r * .2, cx + r * .82, cy + r * .1);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(.52, 'rgba(1,8,24,.04)');
    shade.addColorStop(1, 'rgba(0,5,20,.62)');
    ctx.fillStyle = shade;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    for (const impact of state.impacts) drawImpact(impact, cx, cy);
    ctx.restore();

    ctx.strokeStyle = 'rgba(129, 210, 255, .77)';
    ctx.lineWidth = Math.max(1, r * .012);
    ctx.shadowColor = 'rgba(88, 188, 255, .72)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (state.flash && time - state.flash.created < 500) {
      const p = projectVector(rotatePoint(state.flash.lon, state.flash.lat), cx, cy);
      if (p.depth > 0) {
        const progress = (time - state.flash.created) / 500;
        ctx.beginPath();
        ctx.arc(p.x, p.y, state.flash.radiusRatio * state.radius * (1 + progress * 2), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 236, 195, ${1 - progress})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function animate(time) {
    const delta = state.lastFrame ? Math.min((time - state.lastFrame) / 16.67, 2) : 1;
    state.lastFrame = time;
    if (state.pointer && state.pointer.drilling && !state.dragMoved && time - state.pointer.lastDrillTime >= 320) {
      applyImpact(state.pointer.drillWorld, 'laser');
      state.pointer.lastDrillTime = time;
    }
    if (!state.pointer) state.rotation += 0.0007 * state.sensitivity * delta;
    ctx.clearRect(0, 0, state.width, state.height);
    drawStars(time);
    drawPlanet(state.width / 2, state.height / 2, time);
    requestAnimationFrame(animate);
  }

  function pointerCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function hitPlanet(point) {
    const cx = state.width / 2;
    const cy = state.height / 2;
    const sx = (point.x - cx) / state.radius;
    const sy = -(point.y - cy) / state.radius;
    const distance = sx * sx + sy * sy;
    if (distance > 1) return null;
    const depth = Math.sqrt(1 - distance);
    const y = sy * Math.cos(state.tilt) + depth * Math.sin(state.tilt);
    const z = depth * Math.cos(state.tilt) - sy * Math.sin(state.tilt);
    const lon = Math.atan2(sx, z) - state.rotation;
    const lat = Math.asin(Math.max(-1, Math.min(1, y)));
    return { lon: Math.atan2(Math.sin(lon), Math.cos(lon)), lat };
  }

  function updateMissionStatus() {
    impactCount.textContent = String(state.hits).padStart(2, '0');
    planetCondition.textContent = state.hits >= 8 ? '위험' : state.hits >= 3 ? '손상' : '정상';
    planetCondition.style.color = state.hits >= 8 ? '#ff7979' : state.hits >= 3 ? '#ffbd71' : '#57dfa4';
  }

  function applyImpact(world, weapon) {
    const radiusRatio = weapon === 'bomb' ? 0.085 : 0.055;
    const matchingImpact = state.impacts.find(impact => {
      const longitudeDifference = impact.lon - world.lon;
      const cosineDistance = Math.sin(impact.lat) * Math.sin(world.lat)
        + Math.cos(impact.lat) * Math.cos(world.lat) * Math.cos(longitudeDifference);
      return Math.acos(Math.max(-1, Math.min(1, cosineDistance))) < Math.max(impact.radiusRatio, radiusRatio) * 0.85;
    });

    if (matchingImpact) {
      matchingImpact.depth = Math.min(6, matchingImpact.depth + 1);
      if (radiusRatio > matchingImpact.radiusRatio) {
        matchingImpact.radiusRatio = radiusRatio;
        destroyLandUnder(matchingImpact);
      }
    } else {
      const impact = { ...world, weapon, radiusRatio, depth: 1 };
      state.impacts.push(impact);
      destroyLandUnder(impact);
    }
    state.hits += 1;
    state.flash = { ...world, radiusRatio };
    updateMissionStatus();
    stageMessage.textContent = weapon === 'bomb' ? '플라즈마 폭탄 충돌' : '에너지 레이저로 지층을 굴착 중';
  }

  function impactAt(point, weapon = state.weapon) {
    const world = hitPlanet(point);
    if (world) applyImpact(world, weapon);
  }

  canvas.addEventListener('pointerdown', event => {
    const point = pointerCoordinates(event);
    const drilling = state.weapon === 'laser' && hitPlanet(point);
    state.pointer = {
      ...point,
      id: event.pointerId,
      drilling: Boolean(drilling),
      drillWorld: drilling || null,
      lastDrillTime: performance.now()
    };
    state.dragMoved = false;
    if (drilling) applyImpact(drilling, 'laser');
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', event => {
    if (!state.pointer || state.pointer.id !== event.pointerId) return;
    const point = pointerCoordinates(event);
    const dx = point.x - state.pointer.x;
    const dy = point.y - state.pointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) state.dragMoved = true;
    state.rotation += dx / state.radius * state.sensitivity;
    state.tilt = Math.max(-0.75, Math.min(0.75, state.tilt + dy / state.radius * state.sensitivity));
    state.pointer = { ...state.pointer, ...point };
  });

  canvas.addEventListener('pointerup', event => {
    if (!state.pointer || state.pointer.id !== event.pointerId) return;
    if (!state.dragMoved && !state.pointer.drilling) impactAt(pointerCoordinates(event));
    state.pointer = null;
  });
  canvas.addEventListener('pointercancel', () => { state.pointer = null; });

  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    state.zoom = Math.max(0.65, Math.min(2.4, state.zoom * Math.exp(-event.deltaY * 0.0015)));
    state.radius = state.baseRadius * state.zoom;
  }, { passive: false });

  document.querySelectorAll('.weapon-button').forEach(button => {
    button.addEventListener('click', () => {
      state.weapon = button.dataset.weapon;
      document.querySelectorAll('.weapon-button').forEach(item => {
        const selected = item === button;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      stageMessage.textContent = state.weapon === 'bomb' ? '플라즈마 폭탄 선택됨 · 클릭하여 타격' : '에너지 레이저 선택됨 · 길게 눌러 더 깊게 굴착';
    });
  });

  sensitivity.addEventListener('input', () => {
    state.sensitivity = Number(sensitivity.value);
    sensitivityValue.textContent = state.sensitivity < .9 ? '느리게' : state.sensitivity > 1.6 ? '빠르게' : '보통';
    const percentage = ((state.sensitivity - Number(sensitivity.min)) / (Number(sensitivity.max) - Number(sensitivity.min))) * 100;
    sensitivity.style.background = `linear-gradient(90deg, #51c7e9 ${percentage}%, #2b354b ${percentage}%)`;
  });

  resetButton.addEventListener('click', () => {
    state.impacts = [];
    state.hits = 0;
    destroyedLandArea = 0;
    for (const cell of landCells) cell.destroyed = false;
    state.pointer = null;
    state.flash = null;
    state.rotation = -0.55;
    state.tilt = -0.12;
    state.zoom = 1;
    state.radius = state.baseRadius;
    updateMissionStatus();
    updatePopulation();
    stageMessage.textContent = '드래그하여 지구를 회전하세요';
  });

  window.addEventListener('resize', resize);
  buildLandGrid();
  updatePopulation();
  resize();
  requestAnimationFrame(animate);
})();
