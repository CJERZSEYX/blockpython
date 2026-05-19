// Blockly block type definitions (for LLM Prompt)
// Key concept:
// field: built-in property of the block, no sub-block needed. e.g., math_number's NUM="85"
// input slot: socket on the block that needs another block connected. e.g., variables_set's VALUE slot needs a math_number

export const BLOCK_DEFINITIONS_FOR_LLM = `
Below are the available Blockly block types. Fields and input slots are fundamentally different — fields are self-contained values, input slots need child blocks.

=== Control ===
1. controls_if - if/else
    Fields: none
    Input slots: IF0(condition→needs Boolean), DO0(then→needs block), ELSE(otherwise→needs block)
    Example: if score>=60: print("PASS") else: print("FAIL")
    → controls_if:1 + logic_compare:1(in IF0 slot) + text_print:2(in DO0/ELSE) + text:2(text in print statements)

2. controls_repeat_ext - repeat N times
    Fields: none
    Input slots: TIMES(count→needs number), DO(body→needs block)
    Example: for i in range(5): print("-")
    → controls_repeat_ext:1 + math_number:1(in TIMES slot, NUM=5) + text_print:1(in DO slot) + text:1(in print, TEXT="-")

3. controls_whileUntil - while loop
    Fields: none
    Input slots: BOOL(condition→needs Boolean), DO(body→needs block)

=== Data ===
4. variables_set - variable assignment
    Fields: VAR(variable name)
    Input slots: VALUE(value→needs number or text)
    Example: score=85 → variables_set:1(VAR=score) + math_number:1(in VALUE slot, NUM=85)

5. math_number - number
    Fields: NUM(value), this is a field, no sub-block needed
    Input slots: none
    Example: 85 → math_number:1(NUM:85)

6. math_arithmetic - arithmetic (add, subtract, multiply, divide, modulo)
    Fields: OP(ADD|MINUS|MULTIPLY|DIVIDE|MODULO)
    Input slots: A, B(each needs a number)
    Example: 3+5 → math_arithmetic:1(OP:ADD) + math_number:2(NUM:3,5)
    Example: 7%2 → math_arithmetic:1(OP:MODULO) + math_number:2(NUM:7,2)

7. logic_compare - comparison
    Fields: OP(EQ|NEQ|LT|LTE|GT|GTE)
    Input slots: A, B(each needs a value)
    Example: score>=60 → logic_compare:1(OP:GTE)

8. logic_operation - and/or
    Fields: OP(AND|OR)
    Input slots: A, B(each needs Boolean)

9. logic_negate - not
    Fields: none
    Input slots: BOOL(needs Boolean)

=== I/O ===
10. text_print - print/output
     Fields: none
     Input slots: TEXT(output content→needs text block)
     Example: print("Hello") → text_print:1 + text:1(in TEXT slot, TEXT="Hello")
     Note: text_print itself has no TEXT field! All text is in the text block connected to its TEXT input slot.

11. sensing_ask - ask and wait
     Fields: none
     Input slots: PROMPT(prompt text→needs text block)
     Example: input("Enter") → sensing_ask:1 + text:1(in PROMPT slot, TEXT="Enter")

=== Text ===
12. text - text string
     Fields: TEXT(text content), this is a field, no sub-block needed
     Input slots: none
     Example: "Hello" → text:1(TEXT:"Hello")

13. text_join - text join
     Fields: none
     Input slots: A, B(each needs a text block)
     Example: "Hello "+name → text_join:1 + text:2(TEXT:"Hello " and "")

14. text_length - string length
     Fields: none
     Input slots: VALUE(needs text block)
     Example: len("hello") → text_length:1 + text:1(TEXT:"hello")

15. math_random_int - random integer
     Fields: none
     Input slots: FROM(start→needs number), TO(end→needs number)
     Example: random.randint(1,10) → math_random_int:1 + math_number:2(NUM:1,10)

Output format:
Return strict JSON in the format:
{
  "blocks": {
    "block_type_name": { "count": occurrences, "fields": { "field_name": ["value1", "value2"] } }
  }
}

Notes:
- fields only exist on blocks that have fields (math_number, variables_set, logic_compare, text, etc.)
- Blocks without fields (controls_if, text_print, sensing_ask, etc.) only have count, no fields
- text_print itself has no TEXT field! Print text always corresponds to a text block
- Field value arrays are ordered by appearance in the code
`;
