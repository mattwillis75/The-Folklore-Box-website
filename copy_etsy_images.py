import os
import shutil

# --- CONFIGURATION ---
SOURCE_FOLDER = r"/Users/mattwillis/Desktop/Etsy Scraper/Folklore_Shop_Data"
TARGET_FOLDER = r"/Users/mattwillis/Documents/website-clone/The-Folklore-Box-website/images"

VALID_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.webp', '.gif')

def copy_images_to_repo():
    # Create the target folder if it doesn't exist yet
    if not os.path.exists(TARGET_FOLDER):
        os.makedirs(TARGET_FOLDER)
        print(f"Created target folder: {TARGET_FOLDER}")
        
    # Quick check to ensure the source folder actually exists
    if not os.path.exists(SOURCE_FOLDER):
        print(f"ERROR: Cannot find the source folder at {SOURCE_FOLDER}")
        print("Please check if your path needs your username (e.g., C:\\Users\\YourName\\Desktop\\...)")
        return

    images_copied = 0
    images_skipped = 0

    print("Scanning folders...")

    # Walk through the scraper directory and all 180 subfolders
    for root, dirs, files in os.walk(SOURCE_FOLDER):
        for file in files:
            if file.lower().endswith(VALID_EXTENSIONS):
                source_path = os.path.join(root, file)
                target_path = os.path.join(TARGET_FOLDER, file)
                
                # Check if the file already exists in your repo to avoid duplicates
                if not os.path.exists(target_path):
                    shutil.copy2(source_path, target_path)
                    print(f"Copied: {file}")
                    images_copied += 1
                else:
                    print(f"Skipped: {file} (Already exists)")
                    images_skipped += 1

    print(f"\nDone! Copied {images_copied} images. Skipped {images_skipped} duplicates.")

if __name__ == "__main__":
    copy_images_to_repo()