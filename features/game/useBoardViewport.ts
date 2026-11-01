'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_BOARD_SIZE, getCellSize } from './board-model';

/** Keeps the rendered grid sized to the current viewport without changing its shape. */
export function useBoardViewport(width: number, height: number) {
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [viewportHeight, setViewportHeight] = useState(900);

  useEffect(() => {
    const measureViewport = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };

    measureViewport();
    window.addEventListener('resize', measureViewport);
    return () => window.removeEventListener('resize', measureViewport);
  }, []);

  const boardWidth = width || DEFAULT_BOARD_SIZE.width;
  const boardHeight = height || DEFAULT_BOARD_SIZE.height;
  const cellSize = useMemo(
    () => getCellSize(viewportWidth, boardWidth, boardHeight, viewportHeight),
    [viewportWidth, viewportHeight, boardWidth, boardHeight],
  );
  const cellGap = 3;

  return {
    boardWidth,
    boardHeight,
    cellSize,
    cellGap,
    stageWidth: boardWidth * cellSize + (boardWidth - 1) * cellGap,
    stageHeight: boardHeight * cellSize + (boardHeight - 1) * cellGap,
  };
}
