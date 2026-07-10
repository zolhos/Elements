import re
import json
import os

def clean_latex(text):
    if not text:
        return ""
    # Remove LaTeX comments
    text = re.sub(r'%.*$', '', text, flags=re.MULTILINE)
    # Remove figure commands
    text = re.sub(r'\\epsfysize\s*=\s*[a-zA-Z0-9.]+', '', text)
    text = re.sub(r'\\centerline\s*\{\s*\\epsffile\s*\{[^}]+\}\s*\}', '', text)
    # Remove other LaTeX markup
    text = re.sub(r'\\newpage', '', text)
    text = re.sub(r'\\vspace\*?\{[^}]*\}', '', text)
    text = re.sub(r'\\noindent', '', text)
    text = re.sub(r'\\spa', '', text)
    text = re.sub(r'\\hfill', '', text)
    text = re.sub(r'\\item\[[^\]]*\]', '', text)
    # Clean up multiple spaces and empty lines
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n+', '\n\n', text)
    return text.strip()

def clean_greek(text):
    if not text:
        return ""
    # Remove \gr{...} and \ggn{...} but preserve inner content
    text = re.sub(r'\\gr\s*\{([^{}]+)\}', r'\1', text)
    text = re.sub(r'\\ggn\s*\{([^{}]+)\}', r'\1', text)
    # Remove kerning in Greek
    text = re.sub(r'\\kern\s*-[0-9.]+[a-zA-Z]+', '', text)
    text = clean_latex(text)
    return text

def extract_dependencies(english_text):
    deps = []
    # Find all references inside brackets [...]
    matches = re.findall(r'\[([^\]]+)\]', english_text)
    for match in matches:
        # Propositions (Prop. X.Y or Props. X.Y and Z.W)
        if 'Prop' in match or 'prop' in match:
            nums = re.findall(r'([0-9]+)\.([0-9]+)', match)
            for b, p in nums:
                deps.append(f'Prop.{b}.{p}')
        # Definitions (Def. X.Y)
        elif 'Def' in match or 'def' in match:
            nums = re.findall(r'([0-9]+)\.([0-9]+)', match)
            for b, d in nums:
                deps.append(f'Def.{b}.{d}')
        # Postulates (Post. X)
        elif 'Post' in match or 'post' in match:
            nums = re.findall(r'([0-9]+)', match)
            for p in nums:
                deps.append(f'Post.1.{p}') # Postulates are only defined in Book 1
        # Common Notions (C.N. X)
        elif 'C.N.' in match or 'c.n.' in match or 'Common Notion' in match:
            nums = re.findall(r'([0-9]+)', match)
            for cn in nums:
                deps.append(f'CN.1.{cn}') # Common Notions are only defined in Book 1

    # Remove duplicates while preserving order
    seen = set()
    return [x for x in deps if not (x in seen or seen.add(x))]

def classify_prop_type(english_proof):
    proof_lower = english_proof.lower()
    if 'required to do' in proof_lower or 'things it was required to do' in proof_lower:
        return 'problem'
    elif 'required to prove' in proof_lower or 'required to show' in proof_lower or 'things it was required to prove' in proof_lower:
        return 'theorem'
    return 'theorem' # Default fallback

def parse_parallel_blocks(tex_content):
    # Finds all \begin{Parallel} ... \end{Parallel} blocks
    pattern = re.compile(r'\\begin\{Parallel\}\s*\{[^{}]*\}\s*\{[^{}]*\}\s*(.*?)\\end\{Parallel\}', re.DOTALL)
    blocks = pattern.findall(tex_content)
    parsed_blocks = []
    
    for block in blocks:
        # Extract \ParallelLText{...} and \ParallelRText{...}
        l_text_match = re.search(r'\\ParallelLText\s*\{(.*?)\}\s*(?=\\ParallelRText)', block, re.DOTALL)
        r_text_match = re.search(r'\\ParallelRText\s*\{(.*?)\}\s*$', block, re.DOTALL)
        
        if l_text_match and r_text_match:
            parsed_blocks.append({
                'greek': l_text_match.group(1).strip(),
                'english': r_text_match.group(1).strip()
            })
    return parsed_blocks

def parse_items(block_text, is_greek=False):
    items = []
    if is_greek:
        # Split by \ggn{x} or x.~\gr{
        matches = re.split(r'\\ggn\s*\{([0-9]+)\}\s*\.~\\gr\s*\{', block_text)
        if len(matches) > 1:
            for i in range(1, len(matches), 2):
                num = int(matches[i])
                content = matches[i+1]
                bracket_count = 1
                greek_body = ""
                for char in content:
                    if char == '{':
                        bracket_count += 1
                    elif char == '}':
                        bracket_count -= 1
                    
                    if bracket_count == 0:
                        break
                    greek_body += char
                
                items.append((num, clean_greek(greek_body)))
    else:
        # English splitting (lenient pattern)
        pattern = re.compile(r'(?:^|\n+)\s*([0-9]+)\s*\.?\s*~?\s*(.*?)(?=\n+\s*[0-9]+\s*\.?\s*~?\s*|$)', re.DOTALL)
        for m in pattern.finditer(block_text):
            num = int(m.group(1))
            body = clean_latex(m.group(2))
            items.append((num, body))
            
    return items

def parse_book(book_num, tex_path):
    print(f"Parsing Book {book_num} from {tex_path}...")
    with open(tex_path, 'r', encoding='utf-8') as f:
        content = f.read()

    subtitle = ""
    subtitle_match = re.search(r'\{\\huge\\it\s+([^\}]+)\}', content)
    if subtitle_match:
        subtitle = subtitle_match.group(1).replace('\n', ' ').strip()
        subtitle = re.sub(r'\\[a-zA-Z]+', '', subtitle).strip()

    # Split the file by bookmarks to separate Book Info, Definitions, and Propositions
    bookmarks = list(re.finditer(r'\\pdfbookmark\[1\]\{([^}]+)\}\{([^}]+)\}', content))
    
    definitions = []
    postulates = []
    common_notions = []
    propositions = []

    first_prop_idx = len(content)
    for bm in bookmarks:
        if 'Proposition' in bm.group(1):
            first_prop_idx = bm.start()
            break
            
    preamble_content = content[:first_prop_idx]
    preamble_parallels = parse_parallel_blocks(preamble_content)
    
    if len(preamble_parallels) > 0:
        # Parse Definitions
        def_block = preamble_parallels[0]
        greek_defs = parse_items(def_block['greek'], is_greek=True)
        english_defs = parse_items(def_block['english'], is_greek=False)
        
        greek_def_dict = dict(greek_defs)
        for num, eng_text in english_defs:
            gk_text = greek_def_dict.get(num, "")
            definitions.append({
                'id': f'Def.{book_num}.{num}',
                'number': num,
                'greek': gk_text,
                'english': eng_text
            })
            
    if book_num == 1 and len(preamble_parallels) > 2:
        # Parse Postulates (Book 1 only)
        post_block = preamble_parallels[1]
        greek_posts = parse_items(post_block['greek'], is_greek=True)
        english_posts = parse_items(post_block['english'], is_greek=False)
        
        greek_post_dict = dict(greek_posts)
        for num, eng_text in english_posts:
            gk_text = greek_post_dict.get(num, "")
            postulates.append({
                'id': f'Post.1.{num}',
                'number': num,
                'greek': gk_text,
                'english': eng_text
            })
            
        # Parse Common Notions (Book 1 only)
        cn_block = preamble_parallels[2]
        greek_cns = parse_items(cn_block['greek'], is_greek=True)
        english_cns = parse_items(cn_block['english'], is_greek=False)
        
        greek_cn_dict = dict(greek_cns)
        for num, eng_text in english_cns:
            gk_text = greek_cn_dict.get(num, "")
            common_notions.append({
                'id': f'CN.1.{num}',
                'number': num,
                'greek': gk_text,
                'english': eng_text
            })

    # Now parse Propositions
    for i, bm in enumerate(bookmarks):
        title = bm.group(1)
        label = bm.group(2)
        if 'Proposition' not in title:
            continue
            
        num_match = re.search(r'Proposition\s+([0-9]+)\.([0-9]+)', title)
        if not num_match:
            continue
                
        b_num = int(num_match.group(1))
        p_num = int(num_match.group(2))
        
        start_idx = bm.end()
        end_idx = len(content)
        for next_bm in bookmarks[i+1:]:
            if 'Proposition' in next_bm.group(1) or 'Book' in next_bm.group(1):
                end_idx = next_bm.start()
                break
                
        prop_content = content[start_idx:end_idx]
        parallels = parse_parallel_blocks(prop_content)
        
        if len(parallels) > 0:
            prop_block = parallels[0]
            
            greek_body = prop_block['greek']
            english_body = prop_block['english']
            
            english_clean = re.sub(r'\\begin\{center\}.*?\\end\{center\}', '', english_body, flags=re.DOTALL)
            english_clean = clean_latex(english_clean)
            
            greek_clean = re.sub(r'\\begin\{center\}.*?\\end\{center\}', '', greek_body, flags=re.DOTALL)
            greek_clean = clean_greek(greek_clean)
            
            eng_paras = [p.strip() for p in english_clean.split('\n\n') if p.strip()]
            gk_paras = [p.strip() for p in greek_clean.split('\n\n') if p.strip()]
            
            eng_statement = eng_paras[0] if len(eng_paras) > 0 else ""
            eng_proof = "\n\n".join(eng_paras[1:]) if len(eng_paras) > 1 else ""
            
            gk_statement = gk_paras[0] if len(gk_paras) > 0 else ""
            gk_proof = "\n\n".join(gk_paras[1:]) if len(gk_paras) > 1 else ""
            
            deps = extract_dependencies(english_body)
            prop_type = classify_prop_type(eng_proof)
            
            propositions.append({
                'id': f'Prop.{book_num}.{p_num}',
                'number': p_num,
                'title': f'Proposition {p_num}',
                'greek_statement': gk_statement,
                'greek_proof': gk_proof,
                'english_statement': eng_statement,
                'english_proof': eng_proof,
                'type': prop_type,
                'dependencies': deps
            })
            
    print(f"Book {book_num} parsed: {len(definitions)} defs, {len(postulates)} posts, {len(common_notions)} cns, {len(propositions)} props.")
    
    return {
        'id': book_num,
        'title': f'Book {book_num}',
        'subtitle': subtitle,
        'definitions': definitions,
        'postulates': postulates,
        'common_notions': common_notions,
        'propositions': propositions
    }

def main():
    workspace = '/Users/diegozolhos/Projects/Elementos'
    
    books_config = [
        (1, os.path.join(workspace, 'Book01', 'Book1.tex')),
        (2, os.path.join(workspace, 'Book02', 'Book2.tex')),
        (3, os.path.join(workspace, 'Book03', 'Book3.tex')),
        (4, os.path.join(workspace, 'Book04', 'Book4.tex')),
        (5, os.path.join(workspace, 'Book05', 'Book5.tex')),
        (6, os.path.join(workspace, 'Book06', 'Book6.tex')),
        (7, os.path.join(workspace, 'Book07', 'Book7.tex')),
        (8, os.path.join(workspace, 'Book08', 'Book8.tex')),
        (9, os.path.join(workspace, 'Book09', 'Book9.tex')),
        (10, os.path.join(workspace, 'Book10', 'Book10.tex')),
        (11, os.path.join(workspace, 'Book11', 'Book11.tex')),
        (12, os.path.join(workspace, 'Book12', 'Book12.tex')),
        (13, os.path.join(workspace, 'Book13', 'Book13.tex'))
    ]
    
    index_data = []
    output_dir = os.path.join(workspace, 'webpage')
    os.makedirs(output_dir, exist_ok=True)
    
    for book_num, tex_path in books_config:
        if os.path.exists(tex_path):
            book = parse_book(book_num, tex_path)
            
            # 1. Structure the Book Index representation (lightweight)
            book_index = {
                'id': book['id'],
                'title': book['title'],
                'subtitle': book['subtitle'],
                'definitions': [{
                    'id': d['id'],
                    'number': d['number'],
                    'type': 'definition',
                    'english': d['english'],
                    'dependencies': []
                } for d in book['definitions']],
                'postulates': [{
                    'id': p['id'],
                    'number': p['number'],
                    'type': 'postulate',
                    'english': p['english'],
                    'dependencies': []
                } for p in book['postulates']],
                'common_notions': [{
                    'id': c['id'],
                    'number': c['number'],
                    'type': 'common_notion',
                    'english': c['english'],
                    'dependencies': []
                } for c in book['common_notions']],
                'propositions': [{
                    'id': p['id'],
                    'number': p['number'],
                    'type': p['type'],
                    'title': p['title'],
                    'english_statement': p['english_statement'],
                    'dependencies': p['dependencies']
                } for p in book['propositions']]
            }
            index_data.append(book_index)
            
            # 2. Structure Book Content representation (heavy text)
            book_content = {}
            for d in book['definitions']:
                book_content[d['id']] = {
                    'greek': d['greek'],
                    'english': d['english']
                }
            for p in book['postulates']:
                book_content[p['id']] = {
                    'greek': p['greek'],
                    'english': p['english']
                }
            for c in book['common_notions']:
                book_content[c['id']] = {
                    'greek': c['greek'],
                    'english': c['english']
                }
            for p in book['propositions']:
                book_content[p['id']] = {
                    'greek_statement': p['greek_statement'],
                    'greek_proof': p['greek_proof'],
                    'english_statement': p['english_statement'],
                    'english_proof': p['english_proof']
                }
                
            # Save book content to separate content file
            content_path = os.path.join(output_dir, f'content_book_{book_num}.json')
            with open(content_path, 'w', encoding='utf-8') as f_content:
                json.dump(book_content, f_content, ensure_ascii=False, indent=2)
                
        else:
            print(f"Error: {tex_path} not found.")
            
    # Save global Index representation
    index_path = os.path.join(output_dir, 'elements_index.json')
    with open(index_path, 'w', encoding='utf-8') as f_index:
        json.dump(index_data, f_index, ensure_ascii=False, indent=2)
        
    print(f"\nAll books parsed successfully!")
    print(f"Global index saved to: {index_path}")
    print(f"Content files saved to webpage/content_book_[1-{len(books_config)}].json")

if __name__ == '__main__':
    main()
