import os
from PIL import Image, ImageOps

# Configuration
IMAGE_DIR = 'images'
GRID_DIR = os.path.join(IMAGE_DIR, 'grid')
THUMB_DIR = os.path.join(IMAGE_DIR, 'thumbs')

# Exact Pixel Dimensions (Width, Height)
SIZE_MAIN = (1200, 900)   # 4:3 Ratio for the main product page gallery
SIZE_GRID = (600, 600)    # 1:1 Ratio for the shop page grid
SIZE_THUMB = (160, 160)   # 1:1 Ratio for the clickable thumbnails (Double 80px for crisp Retina display)
JPEG_QUALITY = 82

def setup():
    os.makedirs(GRID_DIR, exist_ok=True)
    os.makedirs(THUMB_DIR, exist_ok=True)
    print(f"Directories ready: {GRID_DIR}, {THUMB_DIR}")

def optimize_images():
    setup()
    
    for filename in os.listdir(IMAGE_DIR):
        file_path = os.path.join(IMAGE_DIR, filename)
        
        # Skip directories and non-images
        if os.path.isdir(file_path) or not filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            continue

        try:
            with Image.open(file_path) as img:
                # Convert to RGB to ensure JPEG compatibility
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                
                # 1. Create the perfectly square Shop Grid Image (600x600)
                grid_img = ImageOps.fit(img, SIZE_GRID, Image.Resampling.LANCZOS)
                grid_img.save(os.path.join(GRID_DIR, filename), optimize=True, quality=JPEG_QUALITY)
                
                # 2. Create the perfectly square Gallery Thumbnail (160x160)
                thumb_img = ImageOps.fit(img, SIZE_THUMB, Image.Resampling.LANCZOS)
                thumb_img.save(os.path.join(THUMB_DIR, filename), optimize=True, quality=JPEG_QUALITY)

                # 3. Create the 4:3 Main Product Image (1200x900)
                # We do this last, so we can overwrite the original file in the root images/ folder
                main_img = ImageOps.fit(img, SIZE_MAIN, Image.Resampling.LANCZOS)
                main_img.save(file_path, optimize=True, quality=JPEG_QUALITY)

                print(f"Successfully processed and cropped: {filename}")

        except Exception as e:
            print(f"Failed to process {filename}: {e}")

if __name__ == '__main__':
    print("Starting exact-fit image optimization process...")
    optimize_images()
    print("Optimization complete!")