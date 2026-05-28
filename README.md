# KÜRAT[OR]

![Kurator](https://assets.kuratorapp.cc/brand/PNG/kurator_wide-white.png)

![Uptime Robot status](https://img.shields.io/uptimerobot/status/m803121806-9c180235ac20e6e517aeec67?logo=uptimerobot&label=UptimeRobot)
![GitHub go.mod Go version](https://img.shields.io/github/go-mod/go-version/boxingoctopuscreative/kurator?filename=%2Fapi%2Fgo.mod&logo=go)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/boxingoctopuscreative/kurator/ci-release.yml?logo=github)
![Discord](https://img.shields.io/discord/1496176586859217067?logo=discord&label=Discord&link=https%3A%2F%2Fdiscord.gg%2FrjHYuGHFNG)


## Introduction

[**KÜRAT[OR]**](https://kuratorapp.cc) *(aka "Kurator", if you're feeling less insufferable)*, is your one-stop shop for tracking all the physical media that lovingly gathers dust on your shelves; whether it's video games, music, movies, tv, books, comics...Kurator will make it all make sense, because you (and your hoard) deserve better than a shitty Google spreadsheet.

![Kurator Dashboard](https://assets.kuratorapp.cc/brand/screenshots/dashboard.png)
![Kurator Collection View](https://assets.kuratorapp.cc/brand/screenshots/collections.png)

## Wishlists: Because The Hoard Must Grow...

Still got a spare few cubic centimetres of your library, man cave, she-shed, basement, apartment, basement apartment, storage locker, or your mom's basement?

**FILL IT WITH MORE OF YOUR CRAP, YOU COWARD!!**

Build up wishlists in Kurator! Share them with friends in the futile hopes that one of them will be ~~an enabling svengali~~ a *"real one"* who supports your ~~addiction~~ hobby!

![Kurator Wishlists View](https://assets.kuratorapp.cc/brand/screenshots/wishlists.png)
![Kurator Wishlist Example](https://assets.kuratorapp.cc/brand/screenshots/wishlist.png)

## Hitlists: We're Totally Not Ripping Off Reddit...

You're a hopeless nerd. You collect dusty old tomes. You have OPINIONS, we get it. It's cool. You're among friends here. So, join your friends, share your hot takes via Kurator's "Hitlists". Create that ultimate 80s action movie tier list you've had kicking around in your brain.

![Kurator Hitlist Dashboard](https://assets.kuratorapp.cc/brand/screenshots/hitlists.png)
![Kurator Hitlist View](https://assets.kuratorapp.cc/brand/screenshots/hitlist.png)
![Kurator Hitlist Comments](https://assets.kuratorapp.cc/brand/screenshots/hitlistcomments.png)

## Other Fun Features

### Item Autofill

You're lazy, we know you are. That's cool though, we get it. Kurator looks stuff up for you as you add it to your collection so that collecting crap doesn't turn into a boring data entry job.

### Fun Themes!

Remember when you could make Windows Media Player, or Netscape, or Winamp look as cringy as you damn well please? Yeah, we miss [Skeuomorphism](https://aesthetics.fandom.com/wiki/Skeuomorphism) and HTML `<marquee>` and `<blink>` tags too...so we included a theming engine into Kurator! (This is still early stages, so no Carbon Fibre or Anime Waifu themes...yet.)

## Boring Nerd Stuff (The Stack)

Kurator uses the following tech stack:

### UI

* Next.js + Turbopack (16.2.6)
* Tailwind (4.2.2) *(w/custom components)*
* TypeScript (5.7.2)

## API

* Go (1.2.5)
* Fiber (2.52.13)

## Infra

* PostgreSQL 18
* Meilisearch 1.42
* Valkey (Redis) 8
* S3-Compatible Object Storage

## Buuuuut, It's Still a Work in Progress...

Kurator is still in active beta. You're welcome to sign up, but by invite-only. Want to ~~sign up for unpaid labour~~ Help make Kurator as badass as we all know it can be? 

* [**Join the Discord!**](https://discord.gg/rjHYuGHFNG)
* [**Contribute!**](DEVELOPERS.md)
