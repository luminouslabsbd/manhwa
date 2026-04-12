#!/usr/bin/env python3
"""Add Treasure Island characters to data.json based on the storyboard."""
import json, uuid

db = json.load(open("data.json"))
project_id = db["projects"][0]["id"]

characters = [
    {
        "name": "Jim Hawkins",
        "role": "Protagonist, young narrator",
        "description": "A brave and resourceful teenage boy who becomes entangled in a pirate treasure hunt. Loyal, curious, and daring.",
        "appearance": "14 year old boy, lean build, tousled brown hair, bright determined eyes, worn linen shirt, brown leather vest, knee-length breeches, simple boots, youthful face with resolute expression",
    },
    {
        "name": "Billy Bones",
        "role": "Inciting character, old pirate captain",
        "description": "A retired pirate who brings the treasure map to the Admiral Benbow inn. Paranoid, heavy-drinking, haunted by his past.",
        "appearance": "middle-aged rugged man, weathered face, visible scar across cheek, unshaven beard, long messy hair, pirate-style worn clothes, heavy build, intense gaze, old naval coat, tricorn hat",
    },
    {
        "name": "Long John Silver",
        "role": "Antagonist, charismatic pirate cook",
        "description": "The cunning and charming one-legged sea cook who leads the mutiny. Master manipulator with a parrot on his shoulder.",
        "appearance": "tall imposing man, one wooden peg leg, broad shoulders, weathered tan skin, crafty smile, long tied-back hair, earring, cook's apron over pirate clothes, parrot on shoulder, wooden crutch",
    },
    {
        "name": "Captain Smollett",
        "role": "Ship captain, authority figure",
        "description": "Stern and competent captain of the Hispaniola. Suspicious of the crew from the start. Honorable and disciplined.",
        "appearance": "middle-aged commanding man, clean-shaven, sharp jawline, naval captain uniform, tricorn hat, stern expression, upright posture, weathered but disciplined, sword at belt",
    },
    {
        "name": "Dr. Livesey",
        "role": "Ally, physician and magistrate",
        "description": "A calm and rational doctor who joins the treasure expedition. Brave, intelligent, and level-headed in danger.",
        "appearance": "gentleman in his 40s, clean appearance, powdered wig or neat hair, physician's coat, waistcoat, spectacles, kind but serious face, carries medical bag, educated demeanor",
    },
    {
        "name": "Squire Trelawney",
        "role": "Ally, wealthy squire who funds the expedition",
        "description": "An enthusiastic but naive country squire who finances the voyage. Talkative and boastful but means well.",
        "appearance": "portly wealthy gentleman, red-cheeked, fine clothes, embroidered waistcoat, powdered wig, jovial expression, gold buttons, richly dressed, slightly pompous bearing",
    },
    {
        "name": "Ben Gunn",
        "role": "Marooned pirate, eventual ally",
        "description": "A half-mad pirate marooned on Treasure Island for three years. Desperate, eccentric, but ultimately helpful.",
        "appearance": "gaunt wild man, ragged torn clothes, sun-darkened skin, wild unkempt long hair and beard, wide desperate eyes, barefoot, tattered remains of sailor clothes, sunburned, thin and wiry",
    },
    {
        "name": "Blind Pew",
        "role": "Villain, delivers the black spot",
        "description": "A terrifying blind beggar who delivers the black spot to Billy Bones. Cruel, ruthless, and menacing despite his blindness.",
        "appearance": "hunched blind old man, milky white sightless eyes, hooded cloak, gnarled walking stick, skeletal thin hands, green shade over eyes, ragged dark clothes, menacing posture, sharp cruel face",
    },
    {
        "name": "Israel Hands",
        "role": "Pirate, Silver's henchman",
        "description": "A dangerous and cunning pirate who serves as coxswain. Nearly kills Jim aboard the Hispaniola.",
        "appearance": "scarred muscular pirate, bandana, rough weathered face, missing teeth, cutlass at belt, sleeveless shirt, tattoos on arms, dangerous look, dark stubble, bloodshot eyes",
    },
]

db["characters"] = []
for c in characters:
    db["characters"].append({
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "name": c["name"],
        "description": c["description"],
        "appearance": c["appearance"],
        "role": c["role"],
        "reference_prompt": f"Character reference sheet, full body portrait, front view, clean white background, studio lighting, highly detailed anime/manhwa style illustration. {c['name']}: {c['appearance']}. Consistent character design, neutral pose, clear visible features, full body from head to toe",
        "reference_image": None,
        "seed": None,
        "status": "draft",
        "created_at": "2026-04-06T00:00:00.000Z",
    })

with open("data.json", "w") as f:
    json.dump(db, f, indent=2)

print(f"Added {len(characters)} characters to project '{db['projects'][0]['name']}'")
for c in characters:
    print(f"  👤 {c['name']} — {c['role']}")
