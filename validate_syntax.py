import sys
import subprocess

def validate_js(file_path):
    try:
        # Using node --check to validate syntax
        result = subprocess.run(['node', '--check', file_path], capture_output=True, text=True)
        if result.returncode == 0:
            return 0
        else:
            print(f"Syntax error in {file_path}:")
            print(result.stderr)
            return 1
    except Exception as e:
        print(f"Error validating {file_path}: {e}")
        return 1

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 validate_syntax.py <file_path>")
        sys.exit(1)
    
    exit_code = 0
    for file_path in sys.argv[1:]:
        exit_code |= validate_js(file_path)
    
    sys.exit(exit_code)
