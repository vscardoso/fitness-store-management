declare module 'react-native-view-shot' {
  import { Component } from 'react';
  
  export interface CaptureOptions {
    format?: 'jpg' | 'png' | 'webm' | 'raw';
    quality?: number;
    result?: 'tmpfile' | 'base64' | 'data-uri' | 'zip-base64';
    width?: number;
    height?: number;
    snapshotContentContainer?: boolean;
  }

  export function captureRef<T>(
    view: number | React.RefObject<T> | T,
    options?: CaptureOptions
  ): Promise<string>;

  export function releaseCapture(uri: string): void;

  export function captureScreen(options?: CaptureOptions): Promise<string>;
}
