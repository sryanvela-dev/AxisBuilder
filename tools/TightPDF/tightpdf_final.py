from __future__ import annotations

import os
import re
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

try:
    import fitz
    from PIL import Image
except ImportError as exc:
    raise SystemExit(
        "Missing required packages. Run BUILD_TightPDF_FINAL.bat to install them."
    ) from exc

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
except ImportError:
    DND_FILES = None
    TkinterDnD = None


APP_NAME = "TightPDF"
APP_VERSION = "1.2"

BG = "#F6F7F9"
CARD = "#FFFFFF"
BORDER = "#D8DDE5"
TEXT = "#17191C"
MUTED = "#6B7280"
BLUE = "#146DE0"
BLUE_DARK = "#0F5CC0"
RED = "#E52620"
GREEN = "#22A447"


def resource_path(name: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / name


def clean_base_name(value: str) -> str:
    value = re.sub(r'[<>:"/\\|?*]', "_", value.strip())
    return value.rstrip(". ") or "Page"


def tight_crop(image: Image.Image, threshold: int, padding: int) -> Image.Image:
    rgb = image.convert("RGB")
    gray = rgb.convert("L")
    mask = gray.point(lambda p: 255 if p < threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        return rgb

    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(rgb.width, right + padding)
    bottom = min(rgb.height, bottom + padding)
    return rgb.crop((left, top, right, bottom))


def convert_pdf(
    pdf_path: Path,
    output_folder: Path,
    base_name: str,
    dpi: int,
    quality: int,
    padding: int,
    threshold: int,
    progress,
) -> list[Path]:
    output_folder.mkdir(parents=True, exist_ok=True)
    document = fitz.open(pdf_path)

    if document.page_count == 0:
        raise ValueError("The PDF has no pages.")

    scale = dpi / 72.0
    matrix = fitz.Matrix(scale, scale)
    saved: list[Path] = []
    width = max(3, len(str(document.page_count)))

    try:
        for index, page in enumerate(document):
            pix = page.get_pixmap(matrix=matrix, alpha=False, colorspace=fitz.csRGB)
            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            image = tight_crop(image, threshold=threshold, padding=padding)

            if document.page_count == 1:
                target = output_folder / f"{base_name}.jpg"
            else:
                target = output_folder / f"{base_name}_{index + 1:0{width}d}.jpg"

            image.save(
                target,
                "JPEG",
                quality=quality,
                subsampling=0,
                dpi=(dpi, dpi),
            )
            saved.append(target)
            progress(index + 1, document.page_count, target.name)
    finally:
        document.close()

    return saved


class TightPDFApp:
    def __init__(self, root: tk.Tk, initial_pdf: str | None = None):
        self.root = root
        self.root.title("TightPDF — PDF to Image")
        self.root.configure(bg=BG)

        try:
            self.root.iconbitmap(default=str(resource_path("TightPDF.ico")))
        except Exception:
            pass

        # ~25% smaller than the previous 900x650 layout.
        self.root.geometry("690x610")
        self.root.minsize(650, 590)

        self.pdf_var = tk.StringVar()
        self.output_var = tk.StringVar()
        self.name_var = tk.StringVar()

        # Restored original settings directly on the main window.
        self.dpi_var = tk.IntVar(value=300)
        self.quality_var = tk.IntVar(value=95)
        self.padding_var = tk.IntVar(value=8)
        self.threshold_var = tk.IntVar(value=248)

        self.status_var = tk.StringVar(value="Ready — choose or drop in a PDF.")

        self._configure_styles()
        self._build_ui()
        self._bind_drag_drop()

        self.root.bind("<Return>", self.on_enter)
        self.root.bind("<KP_Enter>", self.on_enter)

        if initial_pdf:
            self.set_pdf(initial_pdf)

    def _configure_styles(self):
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except Exception:
            pass

        style.configure(
            "Tight.Horizontal.TProgressbar",
            troughcolor="#E9EDF3",
            background=BLUE,
            bordercolor="#E9EDF3",
            lightcolor=BLUE,
            darkcolor=BLUE,
        )

    def _build_ui(self):
        # Compact header.
        header = tk.Frame(self.root, bg=CARD, height=92)
        header.pack(fill="x", side="top")
        header.pack_propagate(False)

        icon_canvas = tk.Canvas(
            header,
            width=92,
            height=76,
            bg=CARD,
            highlightthickness=0,
        )
        icon_canvas.pack(side="left", padx=(20, 10), pady=8)
        self._draw_logo(icon_canvas)

        brand = tk.Frame(header, bg=CARD)
        brand.pack(side="left", fill="y", pady=(17, 0))

        title_line = tk.Frame(brand, bg=CARD)
        title_line.pack(anchor="w")
        tk.Label(
            title_line, text="Tight",
            font=("Segoe UI", 24, "bold"),
            bg=CARD, fg=TEXT
        ).pack(side="left")
        tk.Label(
            title_line, text="PDF",
            font=("Segoe UI", 24, "bold"),
            bg=CARD, fg=RED
        ).pack(side="left")

        tk.Label(
            brand, text="PDF to Image",
            font=("Segoe UI", 11),
            bg=CARD, fg=MUTED
        ).pack(anchor="w")

        # Fixed bottom action bar first so it always remains visible.
        action = tk.Frame(
            self.root,
            bg=CARD,
            highlightbackground=BORDER,
            highlightthickness=1
        )
        action.pack(fill="x", side="bottom")

        action_inner = tk.Frame(action, bg=CARD)
        action_inner.pack(fill="x", padx=20, pady=9)

        tk.Button(
            action_inner,
            text="?  About",
            command=self.open_about,
            width=9,
            font=("Segoe UI", 9),
            bg=CARD,
            fg=TEXT,
            activebackground="#F1F4F8",
            activeforeground=TEXT,
            relief="solid",
            bd=1,
            padx=5,
            pady=5,
            cursor="hand2",
        ).pack(side="left")

        self.convert_button = tk.Button(
            action_inner,
            text="▣  Convert PDF",
            command=self.start_conversion,
            font=("Segoe UI", 10, "bold"),
            bg=BLUE,
            fg="white",
            activebackground=BLUE_DARK,
            activeforeground="white",
            relief="flat",
            bd=0,
            padx=26,
            pady=8,
            cursor="hand2",
        )
        self.convert_button.pack(side="right")

        status = tk.Frame(self.root, bg=BG)
        status.pack(fill="x", side="bottom", padx=22, pady=(0, 6))

        self.status_dot = tk.Label(
            status, text="●",
            font=("Segoe UI", 9),
            bg=BG, fg=GREEN
        )
        self.status_dot.pack(side="left")

        tk.Label(
            status,
            textvariable=self.status_var,
            font=("Segoe UI", 8),
            bg=BG, fg=MUTED
        ).pack(side="left", padx=(5, 0))

        tk.Label(
            status,
            text=f"{APP_NAME} v{APP_VERSION}",
            font=("Segoe UI", 8),
            bg=BG, fg=MUTED
        ).pack(side="right")

        # Scroll-free main body with compact spacing.
        body = tk.Frame(self.root, bg=BG)
        body.pack(fill="both", expand=True, padx=22, pady=(12, 8))

        self.source_card = self._make_card(body, "1", "Source PDF")
        self.source_card.pack(fill="x", pady=(0, 7))
        self._build_source_card(self.source_card)

        output_card = self._make_card(body, "2", "Output Folder")
        output_card.pack(fill="x", pady=(0, 7))
        self._build_output_card(output_card)

        filename_card = self._make_card(body, "3", "Output File Name")
        filename_card.pack(fill="x", pady=(0, 7))
        self._build_filename_card(filename_card)

        settings_card = self._make_card(body, "4", "Image Settings")
        settings_card.pack(fill="x", pady=(0, 7))
        self._build_settings_card(settings_card)

        self.progress = ttk.Progressbar(
            body,
            mode="determinate",
            style="Tight.Horizontal.TProgressbar",
        )
        self.progress.pack(fill="x", pady=(2, 0))

    def _draw_logo(self, canvas: tk.Canvas):
        canvas.create_line(10, 18, 10, 6, 22, 6, fill=RED, width=4)
        canvas.create_line(68, 6, 80, 6, 80, 18, fill=RED, width=4)
        canvas.create_line(10, 57, 10, 69, 22, 69, fill=RED, width=4)
        canvas.create_line(68, 69, 80, 69, 80, 57, fill=RED, width=4)

        canvas.create_rectangle(28, 12, 70, 61, outline="#AEB4BC", width=2, fill="white")
        canvas.create_polygon(56, 12, 70, 26, 56, 26, outline="#AEB4BC", fill="#F1F3F5")

        canvas.create_rectangle(20, 22, 49, 36, fill=RED, outline=RED)
        canvas.create_text(34.5, 29, text="PDF", fill="white", font=("Segoe UI", 7, "bold"))

        canvas.create_rectangle(35, 41, 64, 57, outline="#5D636B", width=1)
        canvas.create_polygon(37, 55, 45, 47, 51, 52, 56, 47, 63, 55, fill="#6E747C", outline="")
        canvas.create_oval(56, 43, 60, 47, fill="#6E747C", outline="")

    def _make_card(self, parent, number: str, title: str):
        card = tk.Frame(
            parent,
            bg=CARD,
            highlightbackground=BORDER,
            highlightthickness=1,
            bd=0,
        )
        header = tk.Frame(card, bg=CARD)
        header.pack(fill="x", padx=12, pady=(7, 4))

        tk.Label(
            header,
            text=number,
            font=("Segoe UI", 8, "bold"),
            bg=BLUE,
            fg="white",
            width=2,
        ).pack(side="left")

        tk.Label(
            header,
            text=title,
            font=("Segoe UI", 9, "bold"),
            bg=CARD,
            fg=TEXT,
        ).pack(side="left", padx=(7, 0))
        return card

    def _entry(self, parent, variable):
        return tk.Entry(
            parent,
            textvariable=variable,
            font=("Segoe UI", 9),
            bg="white",
            fg=TEXT,
            relief="solid",
            bd=1,
            highlightbackground=BORDER,
            highlightcolor=BLUE,
            highlightthickness=1,
        )

    def _small_button(self, parent, text, command, width=10):
        return tk.Button(
            parent,
            text=text,
            command=command,
            width=width,
            font=("Segoe UI", 8),
            bg=CARD,
            fg=TEXT,
            activebackground="#F1F4F8",
            activeforeground=TEXT,
            relief="solid",
            bd=1,
            padx=4,
            pady=4,
            cursor="hand2",
        )

    def _build_source_card(self, card):
        row = tk.Frame(card, bg=CARD)
        row.pack(fill="x", padx=12, pady=(0, 2))

        self.pdf_entry = self._entry(row, self.pdf_var)
        self.pdf_entry.pack(side="left", fill="x", expand=True, ipady=4)

        self._small_button(row, "Browse...", self.choose_pdf, width=10).pack(
            side="right", padx=(8, 0)
        )

        tk.Label(
            card,
            text="Drag/drop a PDF or click Browse.",
            font=("Segoe UI", 8),
            bg=CARD,
            fg=MUTED,
        ).pack(anchor="w", padx=12, pady=(2, 7))

    def _build_output_card(self, card):
        row = tk.Frame(card, bg=CARD)
        row.pack(fill="x", padx=12, pady=(0, 2))

        entry = self._entry(row, self.output_var)
        entry.pack(side="left", fill="x", expand=True, ipady=4)

        self._small_button(row, "Open Folder", self.open_output_folder, width=11).pack(
            side="right", padx=(8, 0)
        )

        tk.Label(
            card,
            text="Automatically set to the PDF's folder.",
            font=("Segoe UI", 8),
            bg=CARD,
            fg=MUTED,
        ).pack(anchor="w", padx=12, pady=(2, 7))

    def _build_filename_card(self, card):
        row = tk.Frame(card, bg=CARD)
        row.pack(fill="x", padx=12, pady=(0, 2))

        entry = self._entry(row, self.name_var)
        entry.pack(side="left", fill="x", expand=True, ipady=4)

        tk.Label(
            row,
            text=".jpg",
            font=("Segoe UI", 9),
            bg=CARD,
            fg=TEXT,
            padx=8,
        ).pack(side="right")

        tk.Label(
            card,
            text="Multi-page: Drawing_001.jpg, Drawing_002.jpg, ...",
            font=("Segoe UI", 8),
            bg=CARD,
            fg=MUTED,
        ).pack(anchor="w", padx=12, pady=(2, 7))

    def _build_settings_card(self, card):
        row = tk.Frame(card, bg=CARD)
        row.pack(fill="x", padx=12, pady=(0, 8))

        settings = [
            ("DPI", self.dpi_var, 72, 600),
            ("JPG Quality", self.quality_var, 50, 100),
            ("Edge Padding", self.padding_var, 0, 100),
            ("White Threshold", self.threshold_var, 220, 255),
        ]

        for col, (label, variable, low, high) in enumerate(settings):
            box = tk.Frame(row, bg=CARD)
            box.grid(row=0, column=col, sticky="ew", padx=(0 if col == 0 else 6, 0))
            row.grid_columnconfigure(col, weight=1)

            tk.Label(
                box,
                text=label,
                font=("Segoe UI", 8),
                bg=CARD,
                fg=MUTED,
            ).pack(anchor="w")

            spin = tk.Spinbox(
                box,
                from_=low,
                to=high,
                textvariable=variable,
                font=("Segoe UI", 8),
                width=8,
                relief="solid",
                bd=1,
            )
            spin.pack(fill="x", pady=(2, 0), ipady=2)

    def _bind_drag_drop(self):
        if DND_FILES and hasattr(self.source_card, "drop_target_register"):
            for widget in (self.source_card, self.pdf_entry):
                try:
                    widget.drop_target_register(DND_FILES)
                    widget.dnd_bind("<<Drop>>", self.on_drop)
                except Exception:
                    pass

    def on_enter(self, event=None):
        if str(self.convert_button.cget("state")) != "disabled":
            self.start_conversion()
        return "break"

    def set_pdf(self, value: str):
        path = Path(value.strip().strip("{}\"")).resolve()

        if path.suffix.lower() != ".pdf":
            messagebox.showerror("Invalid file", "Please choose a PDF file.")
            return

        self.pdf_var.set(str(path))
        self.output_var.set(str(path.parent))
        self.name_var.set(path.stem)
        self.status_var.set(f"Ready — {path.name}")

    def on_drop(self, event):
        files = self.root.tk.splitlist(event.data)
        if files:
            self.set_pdf(files[0])

    def choose_pdf(self):
        value = filedialog.askopenfilename(
            title="Select PDF",
            filetypes=[("PDF files", "*.pdf")],
        )
        if value:
            self.set_pdf(value)

    def open_output_folder(self):
        value = self.output_var.get().strip()

        if not value:
            chosen = filedialog.askdirectory(title="Choose Output Folder")
            if chosen:
                self.output_var.set(chosen)
            return

        path = Path(value)
        if not path.exists():
            try:
                path.mkdir(parents=True, exist_ok=True)
            except Exception:
                messagebox.showerror("Folder unavailable", "The output folder could not be opened.")
                return

        try:
            os.startfile(str(path))
        except AttributeError:
            messagebox.showinfo("Output Folder", str(path))
        except Exception as exc:
            messagebox.showerror("Folder unavailable", str(exc))

    def open_about(self):
        messagebox.showinfo(
            "About TightPDF",
            "TightPDF — PDF to Image\n\n"
            "Converts PDF pages to tightly cropped JPG images.\n\n"
            "Click Convert PDF or press Enter to start conversion."
        )

    def start_conversion(self):
        pdf_text = self.pdf_var.get().strip()
        output_text = self.output_var.get().strip()

        pdf_path = Path(pdf_text) if pdf_text else Path()
        output = Path(output_text) if output_text else None

        if not pdf_path.is_file() or pdf_path.suffix.lower() != ".pdf":
            messagebox.showerror("PDF required", "Choose a valid PDF file.")
            return

        if output is None:
            messagebox.showerror("Folder required", "Choose an output folder.")
            return

        base_name = clean_base_name(self.name_var.get())
        self.name_var.set(base_name)

        self.convert_button.configure(state="disabled", text="Converting...")
        self.progress["value"] = 0
        self.status_dot.configure(fg=BLUE)
        self.status_var.set("Converting PDF...")

        threading.Thread(
            target=self.worker,
            args=(pdf_path, output, base_name),
            daemon=True,
        ).start()

    def worker(self, pdf_path: Path, output: Path, base_name: str):
        def update(current, total, filename):
            self.root.after(0, self.set_progress, current, total, filename)

        try:
            files = convert_pdf(
                pdf_path,
                output,
                base_name,
                int(self.dpi_var.get()),
                int(self.quality_var.get()),
                int(self.padding_var.get()),
                int(self.threshold_var.get()),
                update,
            )
            self.root.after(0, self.finished, files, output)
        except Exception as exc:
            self.root.after(0, self.failed, str(exc))

    def set_progress(self, current: int, total: int, filename: str):
        self.progress["maximum"] = total
        self.progress["value"] = current
        self.status_var.set(f"Page {current} of {total} — {filename}")

    def finished(self, files: list[Path], output: Path):
        self.convert_button.configure(state="normal", text="▣  Convert PDF")
        self.status_dot.configure(fg=GREEN)
        self.status_var.set(f"Complete — {len(files)} JPG file(s) saved.")
        messagebox.showinfo(
            "Conversion complete",
            f"Created {len(files)} tightly cropped JPG file(s) in:\n{output}",
        )

    def failed(self, error: str):
        self.convert_button.configure(state="normal", text="▣  Convert PDF")
        self.status_dot.configure(fg=RED)
        self.status_var.set("Conversion failed.")
        messagebox.showerror("Conversion failed", error)


def main():
    root_class = TkinterDnD.Tk if TkinterDnD else tk.Tk
    root = root_class()
    initial_pdf = sys.argv[1] if len(sys.argv) > 1 else None
    TightPDFApp(root, initial_pdf)
    root.mainloop()


if __name__ == "__main__":
    main()
