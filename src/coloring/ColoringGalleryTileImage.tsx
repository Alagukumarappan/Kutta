import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import { getDisplayImage } from './lineArtCache';

// Resolves a gallery item's raw source uri to its (possibly converted)
// display image lazily, per tile -- so a big gallery doesn't block on
// converting every thumbnail at once. Shows the raw source immediately
// (never a blank tile) and swaps to the converted line-art uri once ready;
// on any failure it just keeps showing the raw source, matching
// lineArtCache's own fallback-to-original discipline.
export function ColoringGalleryTileImage({
  testID,
  uri,
  style,
}: {
  testID?: string;
  uri: string;
  style: StyleProp<ImageStyle>;
}) {
  const [displayUri, setDisplayUri] = useState(uri);

  useEffect(() => {
    let cancelled = false;
    setDisplayUri(uri);

    getDisplayImage(uri)
      .then((result) => {
        if (!cancelled) setDisplayUri(result.uri);
      })
      .catch(() => {
        // Keep showing the raw source uri -- matches getDisplayImage's own
        // fallback-to-original behavior for every internal failure.
      });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return <Image testID={testID} source={{ uri: displayUri }} style={style} resizeMode="cover" />;
}
