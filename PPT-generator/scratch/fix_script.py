import re

with open("generate_report_v2.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update MAX_TOKENS
content = content.replace("MAX_TOKENS = 8192", "MAX_TOKENS = 16384")
content = content.replace("Sonnet max; increase if you need more pages", "Increased to prevent page truncation")

# 2. Update PDF paths
content = content.replace("17261262180_25589600.pdf", "17261262180.25589600.pdf")
content = content.replace("17412518980_67330900.pdf", "17412518980.67330900.pdf")

# 3. Remove GRAVITA_DATA dictionary
content = re.sub(r'GRAVITA_DATA = \{.*?\n\}\n', '# Data is now loaded from JSON\n', content, flags=re.DOTALL)

# 4. Update argparse
argparse_old = """    parser.add_argument("--company", default="Gravita", help="Company name for output filename")
    parser.add_argument("--output", default=None, help="Output HTML file path")"""
argparse_new = """    parser.add_argument("--company", default="Gravita", help="Company name for output filename")
    parser.add_argument("--data", default="gravita_data.json", help="Path to company JSON data file")
    parser.add_argument("--output", default=None, help="Output HTML file path")"""
content = content.replace(argparse_old, argparse_new)

# 5. Data loading in main
load_old = """    output_file = args.output or f"tikona_{args.company.lower().replace(' ', '_')}_landscape.html"

    print("📂 Loading context layers...")
    print()

    # Layer 1: Reference CSS (exact design system)"""
load_new = """    print("📂 Loading context layers...")
    print()

    print(f"  [1/4] Research Data ({args.data})")
    try:
        with open(args.data, 'r', encoding='utf-8') as f:
            company_data = json.load(f)
        print(f"    ✓ Data loaded successfully")
    except FileNotFoundError:
        print(f"❌ ERROR: Data file not found: {args.data}")
        sys.exit(1)

    output_file = args.output or f"tikona_{company_data.get('company', args.company).split()[0].lower()}_landscape.html"

    # Layer 2: Reference CSS (exact design system)"""
content = content.replace(load_old, load_new)

# Layers numbering updates
content = content.replace("[1/3] Reference HTML CSS", "[2/4] Reference HTML CSS")
content = content.replace("[2/3] IIFL Style Guide", "[3/4] IIFL Style Guide")
content = content.replace("[3/3] Reference PDFs", "[4/4] Reference PDFs")
content = content.replace("[3/3] PDFs skipped", "[4/4] PDFs skipped")

# 6. user_content call
content = content.replace("user_content = build_user_message_content(GRAVITA_DATA, pdfs_loaded)", "user_content = build_user_message_content(company_data, pdfs_loaded)")

# 7. Update validation logic
val_old = """    if not is_valid:
        print("⚠ WARNING: Output may not be clean HTML.")"""
val_new = """    if page_count < 8:
        print(f"\\n    ⚠ WARNING: Expected 8 pages, but only found {page_count}.")
        print("    The output may be truncated due to token limits.")

    if not is_valid:
        print("⚠ WARNING: Output may not be clean HTML.")"""
content = content.replace(val_old, val_new)

with open("generate_report_v2.py", "w", encoding="utf-8") as f:
    f.write(content)
print("Changes applied!")
