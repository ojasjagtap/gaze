#!/usr/bin/env python3
"""
Simple script to create icons for the Gaze extension
"""

from PIL import Image, ImageDraw

def create_eye_icon(size, bg_color=(102, 126, 234), eye_color=(255, 255, 255)):
    """Create a simple eye icon"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw background circle
    margin = size // 8
    draw.ellipse([margin, margin, size - margin, size - margin], fill=bg_color)

    # Draw eye shape (ellipse)
    eye_margin = size // 4
    eye_height = size // 2
    draw.ellipse([eye_margin, eye_height - size//8,
                  size - eye_margin, eye_height + size//8],
                 fill=eye_color)

    # Draw pupil (smaller circle)
    pupil_size = size // 6
    center = size // 2
    draw.ellipse([center - pupil_size//2, eye_height - pupil_size//2,
                  center + pupil_size//2, eye_height + pupil_size//2],
                 fill=bg_color)

    return img

def main():
    sizes = [16, 32, 48, 128]

    for size in sizes:
        icon = create_eye_icon(size)
        icon.save(f'icons/icon{size}.png')
        print(f'Created icon{size}.png')

if __name__ == '__main__':
    main()
