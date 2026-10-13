"""Helpers for the one-off event authoring script. Not used at runtime."""

EVENTS = []


def add(id, title, type, start, end, lat, lng, place, continent, summary, dateNote, path=None):
    event = {
        "id": id,
        "title": title,
        "type": type,
        "start": start,
        "end": end,
        "lat": lat,
        "lng": lng,
        "place": place,
        "continent": continent,
        "summary": summary,
        "dateNote": dateNote,
    }
    if path:
        event["path"] = [{"lat": lat_, "lng": lng_} for lat_, lng_ in path]
    EVENTS.append(event)


def P(*pairs):
    return pairs
