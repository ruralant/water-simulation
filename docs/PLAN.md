# Project plan

A browser-based, interactive simulation of surface water (pluvial) flooding in a
real neighbourhood in Reading (RG1 4EB), driven by design storms, radar rainfall
and, eventually, Met Office ensemble forecasts.

## Goals

1. **An interactive toy:** make it rain over my street and watch where the water goes, in real time, in a browser.
2. **A portfolio piece for a Met Office application:** the headline is
   *"a browser-based, ensemble-driven surface water flood simulator for my street, checked against Environment Agency maps"*.
   It is a miniature version of what the Flood Forecasting Centre (Met Office + EA)
   does with its Surface Water Flooding Hazard Impact Model.

What makes it credible to scientists: **validation and honesty about limitations**,
not visual polish. Each phase ends with a check against something independent.

## Architecture

```
 offline (Python, preprocess/)                       browser (TypeScript + WebGPU, web/)
 ─────────────────────────────                       ────────────────────────────────────
 EA LiDAR DTM/DSM ─┐                                  meta.json + raw binary grids
 OS / OSM vectors ─┼─► wsim-prep ─► 1 m aligned grids ──────────► TerrainRenderer (render)
 (geology, later) ─┘                                               Solver (compute, phase 2)
                                                                   Rain / losses (phase 3+)
```

* **Physics on a 2.5D grid, rendering from the same grid.** The solver works on
  surface elevation (ground + building height) at 1 to 2 m resolution, with no mesh.
* **Everything stays on the GPU.** The water mesh will read the depth buffer in its
  vertex shader, so no data comes back to the CPU each frame.
* **Raw WebGPU, not a 3D engine.** WGSL compute and render shaders share one device and
  buffers directly, and the numerical code stays readable for reviewers.
* Data format: see [DATA_FORMAT.md](DATA_FORMAT.md).

## Key modelling choices

| Topic | Choice | Why |
|---|---|---|
| Buildings | Solid blocks with flat roofs (median LiDAR height per footprint) | Clean walls for the solver, robust to chimneys |
| Roof rain | Route to adjacent ground cells (downpipes) | Otherwise roofs store water unrealistically |
| First solver | Local inertial approximation (Bates et al. 2010; de Almeida et al. 2012) | Simple, robust when wetting and drying, standard (LISFLOOD-FP) |
| Later solver | Finite-volume shallow water equations: HLLC solver, hydrostatic reconstruction (Audusse et al. 2004) | Steep streets, faster flows |
| Domain | Whole upstream catchment draining into the neighbourhood | Water arrives from uphill |
| Sewers | Uniform drainage sink on paved cells (~12 mm/h default), user slider | Thames Water network is not open data |
| Infiltration | Curve Number or Green-Ampt per cell from land cover + BGS geology | East Reading likely sits on clay (Reading Formation / London Clay) |
| Hazard display | Defra/EA FD2320 hazard rating `HR = d(v + 0.5) + DF` | The UK standard, more meaningful than depth alone |

## Phases

### Phase 1: terrain and data pipeline ✅ scaffolded

- [x] `wsim-prep` Python package: synthetic neighbourhood, EA LiDAR loader (mosaic, crop, resample, fill holes), building heights, land cover, binary export
- [x] Browser viewer: WebGPU heightfield, land cover and elevation (contour) views, orbit camera, cell picking with BNG coordinates
- [x] Offscreen snapshot tool (`web/snapshot.html`) for screenshots and visual checks
- [ ] Download real EA LiDAR + OS data for RG1 4EB (see [GETTING_REAL_DATA.md](GETTING_REAL_DATA.md))
- [ ] Catchment delineation: priority-flood depression filling + D8 flow accumulation to find the area draining into the neighbourhood; set the domain from it
- [ ] Sanity check: compare building heights against Street View for a few known houses

### Phase 2: the solver

- [ ] Local inertial scheme in WGSL compute shaders (flow update pass + depth update pass), adaptive timestep from the CFL condition
- [ ] Water rendering: depth-coloured translucent surface, flow particles
- [ ] Interaction: paint rain with the mouse, constant-intensity rain slider, pause / speed controls
- [ ] **Validation:** 1D dam break vs. the analytical (Ritter) solution; mass conservation check (rain in = stored + outflow, to floating-point tolerance)
- [ ] Performance: steps per frame vs. grid size on a laptop and a desktop GPU

### Phase 3: hydrology

- [ ] Design storms: FEH22 depth-duration-frequency data → FEH summer profile hyetographs for 1-in-30, 1-in-100, 1-in-1000 year events (UKCEH FEH Web Service)
- [ ] Climate uplift: EA peak rainfall intensity allowances (management catchment) and UKCP18
- [ ] Losses: interception/depression storage, infiltration, drainage sink, antecedent wetness toggle
- [ ] Roof downpipe routing; sandbag/barrier placement editing elevation live
- [ ] Hazard rating colouring; per-house depth-over-time chart
- [ ] **Validation:** EA 2D benchmark Test 8A (rain on an urban area); compare extents with EA *Risk of Flooding from Surface Water* (NaFRA2, 2025) using the Critical Success Index

### Phase 4: real storms

- [ ] Met Office NIMROD 1 km / 5 min radar from the CEDA archive: replay a real storm over Reading
- [ ] EA flood-monitoring API rain gauges for a live "current conditions" mode
- [ ] Compare with any recorded local flooding (news, photos, council reports)

### Phase 5: ensembles (the headline feature)

- [ ] MOGREPS-UK ensemble rainfall (Met Office Weather DataHub) → one simulation per member
- [ ] Probability-of-flooding map: fraction of members exceeding a depth or hazard threshold per cell
- [ ] Write-up: method, validation plots, limitations, what an operational version would need

## Data sources (England)

| Data | Source | Licence |
|---|---|---|
| DTM / DSM 1 m | EA LiDAR Composite / National LiDAR Programme (DEFRA Data Services Platform) | OGL |
| Buildings, roads | OS OpenMap Local, OS Open Roads; or OpenStreetMap | OGL / ODbL |
| Greenspace | OS Open Greenspace | OGL |
| Geology | BGS Geology 1:50k | OGL |
| Design rainfall | FEH22 DDF, UKCEH FEH Web Service | Licensed (fee) |
| Radar | Met Office NIMROD via CEDA | Non-commercial, registration |
| Forecasts | Met Office Weather DataHub (UKV, MOGREPS-UK) | Free tier, check limits |
| Rain gauges | EA flood-monitoring API | OGL, no key |
| Validation | EA Risk of Flooding from Surface Water | OGL |

## References

* Bates, Horritt & Fewtrell (2010). A simple inertial formulation of the shallow water equations for efficient two-dimensional flood inundation modelling. *J. Hydrology* 387.
* de Almeida, Bates, Freer & Souvignet (2012). Improving the stability of a simple formulation of the shallow water equations for 2-D flood modeling. *Water Resources Research* 48.
* Audusse et al. (2004). A fast and stable well-balanced scheme with hydrostatic reconstruction for shallow water flows. *SIAM J. Sci. Comput.* 25.
* Environment Agency (2013). Benchmarking the latest generation of 2D hydraulic modelling packages (SC120002).
* Defra/EA (2006). Flood Risks to People, Phase 2 (FD2320/TR2).
