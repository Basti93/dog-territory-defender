"""Render Buddy layer PNGs + manifest. Usage:
Blender -b --python render_buddy.py -- [--fast] [--coats golden,cream] [--preview-only] [--out dir] [--size 512 (default)]"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import buddy

buddy.main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
