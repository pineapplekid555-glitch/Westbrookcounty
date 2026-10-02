export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const universeId = url.searchParams.get("universeId");

  if (!universeId || !/^\d+$/.test(universeId)) {
    return new Response(JSON.stringify({error:"Missing or invalid universeId"}), {
      status:400, headers:{"content-type":"application/json"}
    });
  }

  try {
    const [gamesRes, votesRes] = await Promise.all([
      fetch(`https://www.roblox.com/games/86179625322199/Emergency-Westbrook-County=${universeId}`),
      fetch(`https://www.roblox.com/games/86179625322199/Emergency-Westbrook-County${universeId}/votes`)
    ]);

    if (!gamesRes.ok || !votesRes.ok) throw new Error("Roblox API error");

    const games = await gamesRes.json();
    const votes = await votesRes.json();
    const game = games.data?.[0];

    if (!game) throw new Error("Universe not found");

    return new Response(JSON.stringify({
      playing: game.playing ?? 0,
      visits: game.visits ?? 0,
      likes: votes.upVotes ?? 0,
      favorites: game.favoritedCount ?? 0
    }), {
      headers:{
        "content-type":"application/json",
        "cache-control":"public, max-age=60"
      }
    });
  } catch {
    return new Response(JSON.stringify({error:"Unable to retrieve Roblox stats"}), {
      status:502, headers:{"content-type":"application/json"}
    });
  }
}
