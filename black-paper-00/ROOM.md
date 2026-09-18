# The header image

`room-full.svg` is the owner's capture of a Chamber room, 320x200, the C64
screen as pixel paths: pillars either side, the brick back wall, two bats,
the lit candle, Tony with a cyan clone, and the block number along the floor.
A cyan clone means a Dancer; a half wall with two bats and a lit candle means
**token 23**, which is why the live token on this page is #23.

`room.svg` is the banner: the same file with its viewBox cropped to
`0 62 320 66`, so only the pillars and the candle show. Nothing is redrawn —
the crop is a window. To re-cut it, change the viewBox and the img's width
and height in `build.py` together, or the fit stretches.
