# Chullz Poker - Testing Agent Authentication Guide

## Quick Reference

**App URL**: `https://card-battle-arena-76.preview.emergentagent.com`
**Backend API**: Same URL with `/api` prefix

## Test Credentials
| Username | PIN | Role |
|----------|-----|------|
| AceKing | 1111 | player |
| BluffMaster | 2222 | player |
| CardShark | 3333 | player |
| PokerPro | 4444 | player |
| AllInAndy | 5555 | player |
| HighRoller | 6666 | player |
| TableAdmin | 0000 | admin |

---

## PROVEN AUTHENTICATION METHOD (USE THIS)

### Method 1: Using data-testid (RECOMMENDED - Simplest)

```python
# Step 1: Click profile using data-testid
await page.click("[data-testid='profile-aceking']", timeout=5000)
await page.wait_for_timeout(1000)

# Step 2: Click PIN buttons with force=True (for PIN 1111)
for _ in range(4):
    await page.click("[data-testid='pin-btn-1']", force=True)
    await page.wait_for_timeout(300)

# Step 3: Wait for auto-login (triggers when 4 digits entered)
await page.wait_for_timeout(3000)
# User should now be at /lobby
```

### For different users:
```python
# BluffMaster (PIN 2222)
await page.click("[data-testid='profile-bluffmaster']", timeout=5000)
await page.wait_for_timeout(1000)
for _ in range(4):
    await page.click("[data-testid='pin-btn-2']", force=True)
    await page.wait_for_timeout(300)
await page.wait_for_timeout(3000)

# TableAdmin (PIN 0000) - goes to /admin
await page.click("[data-testid='profile-tableadmin']", timeout=5000)
await page.wait_for_timeout(1000)
for _ in range(4):
    await page.click("[data-testid='pin-btn-0']", force=True)
    await page.wait_for_timeout(300)
await page.wait_for_timeout(3000)
```

### Method 2: Bounding Box (Fallback if data-testid fails)

```python
# Step 1: Click on profile card (e.g., AceKing)
await page.click("text=AceKing", timeout=5000)
await page.wait_for_timeout(1000)

# Step 2: Get bounding box of PIN button "1" and click it 4 times for PIN 1111
modal = page.locator("div:has-text('ENTER PIN') button:text-is('1')").first
box = await modal.bounding_box()
if box:
    for i in range(4):
        await page.mouse.click(box['x'] + box['width']/2, box['y'] + box['height']/2)
        await page.wait_for_timeout(400)

# Step 3: Wait for navigation to lobby
await page.wait_for_timeout(3000)
# User should now be at /lobby
```

### For different PINs:
- **PIN 2222 (BluffMaster)**: Click button "2" four times
- **PIN 3333 (CardShark)**: Click button "3" four times
- **PIN 0000 (TableAdmin/Admin)**: Click button "0" four times

```python
# Example for BluffMaster (PIN 2222)
await page.click("text=BluffMaster", timeout=5000)
await page.wait_for_timeout(1000)
modal = page.locator("div:has-text('ENTER PIN') button:text-is('2')").first
box = await modal.bounding_box()
if box:
    for i in range(4):
        await page.mouse.click(box['x'] + box['width']/2, box['y'] + box['height']/2)
        await page.wait_for_timeout(400)
await page.wait_for_timeout(3000)
```

---

## WHY OTHER METHODS FAIL

### ❌ Direct button clicks fail:
```python
# This FAILS - overlay intercepts clicks
await page.click("button:has-text('1')")
```
**Reason**: PIN modal has overlay div that intercepts click events.

### ❌ Force clicks are unreliable:
```python
# This is FLAKY
await page.click("button:has-text('1')", force=True)
```
**Reason**: Multiple "1" buttons exist on page (profile cards show chip counts).

### ❌ Keyboard input doesn't work:
```python
# This FAILS - no input field to focus
await page.keyboard.type("1111")
```
**Reason**: PIN uses button clicks, not text input.

---

## BACKEND API AUTHENTICATION (Alternative)

For backend-only tests, use curl:

```bash
API_URL="https://card-battle-arena-76.preview.emergentagent.com"

# Login and get token
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"AceKing","pin":"1111"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Use token for authenticated requests
curl -s "$API_URL/api/tables" -H "Authorization: Bearer $TOKEN"
```

---

## VERIFYING SUCCESSFUL LOGIN

After authentication, verify:

1. **URL changed**: `page.url` should be `/lobby` (players) or `/admin` (TableAdmin)
2. **localStorage has token**:
```python
token = await page.evaluate("localStorage.getItem('chullz_token')")
assert token is not None
```
3. **User visible in header**: Look for username in top bar

---

## POKER TABLE NAVIGATION

After login, to navigate to a poker table:

```python
# Option 1: Create new table
await page.click("text=Create Table", timeout=5000)
await page.wait_for_timeout(1000)
await page.fill("input[placeholder*='Friday']", "Test Game")
await page.click("text=Create & Join", force=True)
await page.wait_for_timeout(3000)

# Option 2: Join existing table (if one exists)
await page.click("text=Join Table", timeout=5000)
await page.wait_for_timeout(3000)

# Option 3: Direct navigation (requires table ID)
await page.goto(f"{APP_URL}/table/TABLE_ID")
```

---

## KEY SELECTORS

| Element | Selector | data-testid |
|---------|----------|-------------|
| Profile card (AceKing) | `text=AceKing` | `[data-testid='profile-aceking']` |
| Profile card (BluffMaster) | `text=BluffMaster` | `[data-testid='profile-bluffmaster']` |
| Profile card (TableAdmin) | `text=TableAdmin` | `[data-testid='profile-tableadmin']` |
| PIN keypad container | - | `[data-testid='pin-keypad']` |
| PIN button 0 | - | `[data-testid='pin-btn-0']` |
| PIN button 1 | - | `[data-testid='pin-btn-1']` |
| PIN button 2 | - | `[data-testid='pin-btn-2']` |
| PIN button 3-9 | - | `[data-testid='pin-btn-3']` ... `[data-testid='pin-btn-9']` |
| PIN delete button | - | `[data-testid='pin-btn-delete']` |
| PIN confirm button | - | `[data-testid='pin-btn-confirm']` |
| Mute button | - | `[data-testid='mute-toggle']` |
| Create Table button | `text=Create Table` | - |
| Join Table button | `text=Join Table` | - |
| Fold button | `button:has-text('Fold')` | - |
| Call button | `button:has-text('Call')` | - |
| Raise button | `button:has-text('Raise')` | - |

---

## RECOMMENDED AUTH FLOW WITH DATA-TESTID

```python
# Step 1: Click profile using data-testid
await page.click("[data-testid='profile-aceking']", timeout=5000)
await page.wait_for_timeout(1000)

# Step 2: Click PIN buttons using data-testid (for PIN 1111)
for _ in range(4):
    await page.click("[data-testid='pin-btn-1']", force=True)
    await page.wait_for_timeout(300)

# Step 3: Wait for auto-login (triggers when 4 digits entered)
await page.wait_for_timeout(3000)
# OR click confirm manually:
# await page.click("[data-testid='pin-btn-confirm']", force=True)
```

### Alternative: Bounding Box Method (if data-testid clicks fail)
```python
btn = page.locator("[data-testid='pin-btn-1']")
box = await btn.bounding_box()
if box:
    for i in range(4):
        await page.mouse.click(box['x'] + box['width']/2, box['y'] + box['height']/2)
        await page.wait_for_timeout(400)
```

---

## LOCALSTORAGE KEYS

| Key | Description |
|-----|-------------|
| `chullz_token` | JWT authentication token |
| `chullz_user` | JSON string with user data (id, username, chips, etc.) |
| `chullz_muted` | Sound mute state ("true" or "false") |

---

## COMMON ISSUES & SOLUTIONS

| Issue | Solution |
|-------|----------|
| PIN buttons not clickable | Use bounding box mouse click method |
| Session lost after navigation | Check localStorage token is set |
| Redirected to login | Token missing - redo authentication |
| WebSocket fails | Ensure valid token in localStorage before connecting |
| Multiple "1" buttons found | Use `.first` on the locator within modal context |
